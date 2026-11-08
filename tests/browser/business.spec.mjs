import { test, expect } from '@playwright/test';
import { loadSourceModule } from '../helpers/source-modules.mjs';
const { createReactProject } = await loadSourceModule('motes/react-project');
const taskSource = `import React,{useState} from 'react';
export default function App(){const data=window.motes.usePersistentState('tasks',[],Array.isArray),[text,setText]=useState('');
return <main><h1>任务清单</h1><form onSubmit={e=>{e.preventDefault();if(text.trim()&&data.update(v=>[...v,{text:text.trim(),done:false}]))setText('')}}><input aria-label="任务名称" value={text} disabled={data.blocked} onChange={e=>setText(e.target.value)}/><button disabled={data.blocked}>添加任务</button></form><ul>{data.value.map((t,i)=><li key={i}><label><input type="checkbox" checked={t.done} disabled={data.blocked} onChange={()=>data.update(v=>v.map((t,n)=>n===i?{...t,done:!t.done}:t))}/>{t.text}</label></li>)}</ul><p role="status">{data.message}</p>{data.blocked&&!data.loading&&<button onClick={()=>data.reload()}>重新读取</button>}</main>}`;

async function post(page, path, body) {
  if (path === '/api/generate') expect(body.mode).toBe('demo');
  const response = await page.request.post(path, { data: body, headers: { Origin: new URL(test.info().project.use.baseURL).origin } });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function fixture(page, source) {
  const session = await (await page.request.get('/api/session')).json();
  const workspace = await (await page.request.get('/api/workspace')).json();
  let { project } = await post(page, '/api/generate', { prompt: '任务看板', mode: 'demo', requestId: crypto.randomUUID(), managedProjectId: workspace.workspace.defaultProjectId });
  if (source) ({ project } = await post(page, '/api/projects/' + project.id + '/source', { requestId: crypto.randomUUID(), baseVersionId: project.currentVersionId, expectedCurrentVersionId: project.currentVersionId, html: createReactProject({ 'src/App.jsx': source, 'src/index.css': '@import "tailwindcss";' }) }));
  await page.addInitScript(({ workspaceId, groupId, appId }) => { sessionStorage.setItem('motes-lite-selection:' + workspaceId, JSON.stringify({ groupId, appId })); sessionStorage.setItem('motes-lite-mode', 'demo'); }, { workspaceId: session.workspaceId, groupId: workspace.workspace.defaultProjectId, appId: project.id });
  return project;
}
const preview = page => page.frameLocator('.lite-preview-stage > iframe');
async function open(page) { await page.goto('/'); await expect(preview(page).getByRole('status')).toContainText(/已连接|已载入/); }
async function saved(page) { await expect(preview(page).getByRole('status')).toHaveText('已保存到共享空间。'); }

test('empty first use, real UI mutations, reload, code modification and restore preserve business records', async ({ page }) => {
  let project = await fixture(page, taskSource); const original = project.currentVersionId;
  const writes = []; page.on('request', r => { if (r.url().endsWith('/api/runtime-data') && r.postDataJSON()?.action === 'set') writes.push(r.postDataJSON()); });
  await open(page); expect(writes).toHaveLength(0);
  const frame = preview(page); await expect(frame.getByRole('listitem')).toHaveCount(0);
  await frame.getByLabel('任务名称').fill('准备面试'); await frame.getByRole('button', { name: '添加任务', exact: true }).click(); await saved(page);
  await frame.getByRole('checkbox').check(); await saved(page);
  await page.reload(); await expect(frame.getByRole('checkbox')).toBeChecked(); await expect(frame.getByText('准备面试', { exact: true })).toBeVisible();
  ({ project } = await post(page, '/api/projects/' + project.id + '/source', { requestId: crypto.randomUUID(), baseVersionId: project.currentVersionId, expectedCurrentVersionId: project.currentVersionId, html: createReactProject({ 'src/App.jsx': taskSource.replace('任务清单</h1>', '任务清单 · 新版</h1>'), 'src/index.css': '@import "tailwindcss";' }) }));
  await page.reload(); await expect(frame.getByRole('heading', { name: '任务清单 · 新版' })).toBeVisible(); await expect(frame.getByRole('checkbox')).toBeChecked();
  await post(page, '/api/projects/' + project.id + '/restore', { versionId: original }); await page.reload();
  await expect(frame.getByRole('heading', { name: '任务清单', exact: true })).toBeVisible(); await expect(frame.getByRole('checkbox')).toBeChecked();
});

test('two visitors see explicit conflicts without overwriting newer data or losing local input', async ({ page, browser, baseURL }) => {
  await fixture(page, taskSource); await open(page);
  const other = await browser.newContext({ baseURL }); const second = await other.newPage();
  const selection = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('motes-lite-selection:')));
  await second.addInitScript(entries => { for (const [key, value] of entries) sessionStorage.setItem(key, value); }, selection);
  await open(second);
  await preview(page).getByLabel('任务名称').fill('访客 A'); await preview(page).getByRole('button', { name: '添加任务', exact: true }).click(); await saved(page);
  await preview(second).getByLabel('任务名称').fill('访客 B'); await preview(second).getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(preview(second).getByRole('status')).toContainText('保存冲突'); await expect(preview(second).getByText('访客 B', { exact: true })).toBeVisible();
  await page.reload(); await expect(preview(page).getByText('访客 A', { exact: true })).toBeVisible(); await expect(preview(page).getByText('访客 B', { exact: true })).toHaveCount(0);
  await other.close();
});

test('slow hydration blocks mutations instead of overwriting early edits with old records', async ({ page }) => {
  await fixture(page, taskSource);
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/runtime-data', async route => { if (route.request().postDataJSON()?.action === 'get') await gate; await route.continue(); });
  await page.goto('/'); await expect(preview(page).getByLabel('任务名称')).toBeDisabled();
  release(); await expect(preview(page).getByLabel('任务名称')).toBeEnabled();
});

test('failed saves stay visible, retain unsaved content, and never display a saved claim', async ({ page }) => {
  await fixture(page, taskSource); await open(page);
  await page.route('**/api/runtime-data', route => route.request().postDataJSON()?.action === 'set' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'test save unavailable' }) }) : route.continue());
  await preview(page).getByLabel('任务名称').fill('尚未保存'); await preview(page).getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(preview(page).getByRole('status')).toContainText('保存结果未确认'); await expect(preview(page).getByText('尚未保存', { exact: true })).toBeVisible();
  await page.unroute('**/api/runtime-data'); await page.reload(); await expect(preview(page).getByRole('listitem')).toHaveCount(0);
});

test('runtime exceptions in a compiled app surface in the workbench and prepare a repair draft', async ({ page }) => {
  await fixture(page, "export default function App(){throw new TypeError('private test payload');}");
  await page.goto('/'); const diagnostic = page.getByRole('alert', { name: '应用运行错误' });
  await expect(diagnostic).toContainText('TypeError'); await expect(diagnostic).not.toContainText('private test payload');
  await diagnostic.getByRole('button', { name: '准备修复需求' }).click(); await expect(page.getByLabel('应用需求')).toHaveValue(/TypeError/);
});

test('fixed budget and timer examples have working business actions and data survives refresh', async ({ page }) => {
  const session = await (await page.request.get('/api/session')).json();
  const workspace = await (await page.request.get('/api/workspace')).json();
  const { project } = await post(page, '/api/generate', { mode: 'demo', prompt: '旅行预算', requestId: crypto.randomUUID(), managedProjectId: workspace.workspace.defaultProjectId });
  await page.addInitScript(({ id, groupId, appId }) => sessionStorage.setItem('motes-lite-selection:' + id, JSON.stringify({ groupId, appId })), { id: session.workspaceId, groupId: workspace.workspace.defaultProjectId, appId: project.id });
  await open(page); await preview(page).getByLabel('旅行预算上限（元）').fill('9000'); await preview(page).getByRole('button', { name: '保存预算' }).click(); await saved(page);
  await page.reload(); await expect(preview(page).getByLabel('旅行预算上限（元）')).toHaveValue('9000');
  await page.getByRole('button', { name: '新建应用', exact: true }).click(); await page.getByLabel('应用需求').fill('番茄钟'); await page.getByRole('button', { name: '发送需求' }).click();
  await expect(preview(page).getByRole('button', { name: '开始专注' })).toBeEnabled(); await preview(page).getByRole('button', { name: '休息 5 分钟' }).click(); await saved(page);
  await expect(preview(page).getByRole('timer')).toHaveText('05:00'); await page.reload(); await expect(preview(page).getByRole('timer')).toHaveText('05:00');
});
