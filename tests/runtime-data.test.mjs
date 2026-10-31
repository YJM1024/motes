import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

async function harness() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const migrations = (await readdir(new URL('../drizzle/', import.meta.url))).filter(file => file.endsWith('.sql')).sort();
  for (const file of migrations) for (const sql of (await readFile(new URL('../drizzle/' + file, import.meta.url), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) sqlite.exec(sql);
  function prepare(sql, args = []) {
    return {
      sql,
      bind(...values) { return prepare(sql, values); },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() {
        const statement = sqlite.prepare(sql);
        const results = statement.all(...args);
        const changes = Number(sqlite.prepare('SELECT changes() AS changes').get().changes);
        return { results, meta: { changes } };
      },
    };
  }
  const key = randomUUID();
  const env = { MOTES_WORKSPACE_VISIBILITY: 'shared', DB: { prepare } };
  globalThis[key] = env;
  const cache = new Map();
  async function moduleUrl(file) {
    if (cache.has(file)) return cache.get(file);
    const url = new URL('../lib/' + file + '.ts', import.meta.url);
    let source = await readFile(url, 'utf8');
    source = source.replace("import { env } from 'cloudflare:workers';", `const env=globalThis[${JSON.stringify(key)}];`);
    for (const match of [...source.matchAll(/(?:from\s+)(['"])(\.[^'"]+)\1/g)]) {
      const target = new URL(match[2] + '.ts', url);
      source = source.replaceAll(match[1] + match[2] + match[1], JSON.stringify(await moduleUrl(target.pathname.split('/lib/').at(-1).replace(/\.ts$/, ''))));
    }
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const result = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
    cache.set(file, result);
    return result;
  }
  const runtime = await import(await moduleUrl('motes/runtime-data'));
  const demo = await import(await moduleUrl('forma/demo'));
  delete globalThis[key];
  const now = new Date().toISOString();
  function addApp(owner = 'motes-public-demo-v1', currentVersion = randomUUID()) {
    const appId = randomUUID();
    sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(appId, owner, 'Shared app', now, now, currentVersion);
    sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(currentVersion, appId, 1, 'prompt', 'summary', '<!doctype html><html><body></body></html>', now, 'demo', null);
    return { appId, currentVersion };
  }
  async function call(body, { visitor = 'a', origin = 'https://motes.test', declaredLength } = {}) {
    const raw = JSON.stringify(body);
    const headers = { cookie: 'forma_session=' + visitor.repeat(64), origin, 'content-type': 'application/json' };
    if (declaredLength !== undefined) headers['content-length'] = String(declaredLength);
    const request = new Request('https://motes.test/api/runtime-data', { method: 'POST', headers, body: raw });
    const response = await runtime.runtimeData(request);
    return { status: response.status, data: await response.json() };
  }
  const body = (action, appId, versionId, key, extra = {}) => ({ action, appId, versionId, key, ...extra });
  return { sqlite, env, addApp, call, body, demo };
}

test('app-scoped data persists across visitors and compare-and-set rejects a stale writer', async () => {
  const h = await harness();
  try {
    const app = h.addApp();
    const key = 'tasks.items';
    assert.deepEqual((await h.call(h.body('get', app.appId, app.currentVersion, key))).data, { key, value: null, revision: 0, updatedAt: null });
    const first = await h.call(h.body('set', app.appId, app.currentVersion, key, { value: [{ text: 'first' }], expectedRevision: 0 }), { visitor: 'a' });
    assert.equal(first.status, 200);
    assert.equal(first.data.revision, 1);
    const otherVisitor = await h.call(h.body('get', app.appId, app.currentVersion, key), { visitor: 'b' });
    assert.equal(otherVisitor.data.value[0].text, 'first');
    const writes = await Promise.all(['left', 'right'].map(text => h.call(h.body('set', app.appId, app.currentVersion, key, { value: [{ text }], expectedRevision: 1 }))));
    assert.deepEqual(writes.map(result => result.status).sort(), [200, 409]);
    const final = await h.call(h.body('get', app.appId, app.currentVersion, key), { visitor: 'c' });
    assert.equal(final.data.revision, 2);
    assert.ok(['left', 'right'].includes(final.data.value[0].text));
  } finally { h.sqlite.close(); }
});

test('only current, enabled publication, or active fixed-share versions of shared-owner apps can use data', async () => {
  const h = await harness();
  try {
    const app = h.addApp();
    const old = randomUUID();
    h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(old, app.appId, 0, 'old', 'old', '<!doctype html><html><body></body></html>', new Date().toISOString(), 'demo', null);
    h.sqlite.prepare('INSERT INTO motes_publications(app_id,version_id,title,token,published_at,updated_at,enabled,revision,last_request_id) VALUES(?,?,?,?,?,?,?,?,?)').run(app.appId, old, 'published', randomBytes(32).toString('hex'), new Date().toISOString(), new Date().toISOString(), 1, 1, 'request-pub');
    h.sqlite.prepare('INSERT INTO motes_shares(id,app_id,version_id,title,token,request_id,created_at,revoked_at) VALUES(?,?,?,?,?,?,?,NULL)').run(randomUUID(), app.appId, old, 'share', randomBytes(32).toString('hex'), 'request-share', new Date().toISOString());
    const current = await h.call(h.body('get', app.appId, app.currentVersion, 'prefs'));
    const published = await h.call(h.body('get', app.appId, old, 'prefs'));
    assert.equal(current.status, 200);
    assert.equal(published.status, 200);
    const share = h.sqlite.prepare('SELECT id FROM motes_shares WHERE app_id=?').get(app.appId);
    h.sqlite.prepare('UPDATE motes_shares SET revoked_at=? WHERE id=?').run(new Date().toISOString(), share.id);
    assert.equal((await h.call(h.body('get', app.appId, old, 'prefs'))).status, 200); // enabled publication still authorizes it
    h.sqlite.prepare('UPDATE motes_publications SET enabled=0 WHERE app_id=?').run(app.appId);
    assert.equal((await h.call(h.body('get', app.appId, old, 'prefs'))).status, 404);
    const legacy = h.addApp('legacy-private-owner');
    assert.equal((await h.call(h.body('get', legacy.appId, legacy.currentVersion, 'prefs'))).status, 404);
    h.env.MOTES_WORKSPACE_VISIBILITY = 'private';
    assert.equal((await h.call(h.body('get', app.appId, app.currentVersion, 'prefs'))).status, 404);
  } finally { h.sqlite.close(); }
});

test('origin, exact body, byte limits, key and nested JSON rules are enforced', async () => {
  const h = await harness();
  try {
    const app = h.addApp();
    const valid = h.body('get', app.appId, app.currentVersion, 'prefs');
    assert.equal((await h.call(valid, { origin: 'https://attacker.test' })).status, 403);
    assert.equal((await h.call({ ...valid, extra: true })).status, 400);
    assert.equal((await h.call(h.body('get', app.appId, app.currentVersion, '__proto__'))).status, 400);
    const dangerous = JSON.parse('{"__proto__":{"polluted":true}}');
    assert.equal((await h.call(h.body('set', app.appId, app.currentVersion, 'unsafe', { value: dangerous, expectedRevision: 0 }))).status, 400);
    const large = 'x'.repeat(18000);
    assert.equal((await h.call(h.body('set', app.appId, app.currentVersion, 'large', { value: large, expectedRevision: 0 }), { declaredLength: 1 })).status, 413);
    assert.equal((await h.call(valid, { visitor: 'not-hex' })).status, 401);
    for (let index = 0; index < 64; index++) {
      const result = await h.call(h.body('set', app.appId, app.currentVersion, `item${index}`, { value: index, expectedRevision: 0 }));
      assert.equal(result.status, 200);
    }
    assert.equal((await h.call(h.body('set', app.appId, app.currentVersion, 'item64', { value: 64, expectedRevision: 0 }))).status, 413);
  } finally { h.sqlite.close(); }
});

test('aggregate capacity uses UTF-8 bytes and rejected updates preserve value and revision', async () => {
  const h = await harness();
  try {
    const app = h.addApp(), value = '中'.repeat(3000);
    for (let index = 0; index < 29; index++) {
      const response = await h.call(h.body('set', app.appId, app.currentVersion, `data${index}`, { value, expectedRevision: 0 }));
      assert.equal(response.status, 200);
    }
    const before = await h.call(h.body('get', app.appId, app.currentVersion, 'data0'));
    const oversizedUpdate = await h.call(h.body('set', app.appId, app.currentVersion, 'data0', { value: '中'.repeat(4000), expectedRevision: before.data.revision }));
    assert.equal(oversizedUpdate.status, 413);
    assert.equal(oversizedUpdate.data.code, 'capacity');
    const after = await h.call(h.body('get', app.appId, app.currentVersion, 'data0'));
    assert.equal(after.data.revision, before.data.revision);
    assert.equal(after.data.value, value);
    const newKey = await h.call(h.body('set', app.appId, app.currentVersion, 'overflow', { value, expectedRevision: 0 }));
    assert.equal(newKey.status, 413);
  } finally { h.sqlite.close(); }
});

test('generated task, budget, and timer demos restore/save actual shared API data across visitors', async () => {
  const h = await harness();
  try {
    const app = h.addApp();
    const fakeDocument = kind => {
      const elements = new Map(), created = [];
      const make = (name, value = '') => ({ tagName: name, value, textContent: '', disabled: false, children: [], listeners: {}, append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; }, addEventListener(event, callback) { this.listeners[event] = callback; } });
      const id = (selector, name = 'div', value = '') => { if (!elements.has(selector)) elements.set(selector, make(name, value)); return elements.get(selector); };
      const inputs = kind === 'budget' ? [id('#limit','input','5000'),...['800','1200','600','400'].map(value=>make('input',value))] : kind === 'tasks' ? [id('#task','input','')] : [];
      const controls = [...inputs];
      if (kind === 'tasks') controls.push(id('#add','form'));
      const minuteButtons = kind === 'timer' ? [make('button'),make('button')] : [];
      const doc = {
        querySelector(selector) {
          if (selector === '#persistence') return id(selector,'p');
          if (selector === '#limit') return inputs[0];
          if (selector === '.expense') return null;
          if (selector === '#total' || selector === '#remaining' || selector === '#progress') return id(selector, selector==='#progress'?'progress':'p');
          if (selector === '#board') return id(selector,'div');
          if (selector === '#add') return id(selector,'form');
          if (selector === '#task') return inputs[0];
          if (selector === '#clock') return id(selector,'div');
          if (selector === '#toggle') return id(selector,'button');
          if (selector === '#status') return id(selector,'p');
          if (selector === '#reset') return id(selector,'button');
          return id(selector);
        },
        querySelectorAll(selector) {
          if (selector === 'input,button') return controls;
          if (selector === 'input') return inputs;
          if (selector === '.expense') return kind==='budget'?inputs.slice(1):[];
          if (selector === '[data-min]') return minuteButtons;
          return [];
        },
        createElement(name) { const node=make(name); created.push(node); return node; },
      };
      return { doc, inputs, created, id };
    };
    const runDemo = async (kind, visitor, override = {}) => {
      const generated = h.demo.generateDemo(kind==='budget'?'旅行预算计算器':kind==='tasks'?'任务看板':'番茄钟');
      const script = generated.html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
      assert.ok(script, `${kind} demo script exists`);
      const ui = fakeDocument(kind), channel = { data: {
        ready: Promise.resolve({available:true}),
        async get(key) { const result=await h.call(h.body('get',app.appId,app.currentVersion,key),{visitor});if(result.status!==200)throw Error(result.data.error);return result.data; },
        async set(key,value,expectedRevision) { if(override.set)return override.set(key,value,expectedRevision);const result=await h.call(h.body('set',app.appId,app.currentVersion,key,{value,expectedRevision}),{visitor});if(result.status!==200){const error=new Error(result.data.error);error.code=result.data.code;throw error;}return result.data; },
      }};
      runInNewContext(script,{document:ui.doc,window:{motes:channel},TextEncoder,Number,Array,Math,Date,JSON,Promise,Error,clearTimeout,setTimeout,setInterval(){return 1;}});
      const deadline=Date.now()+1000;while(Date.now()<deadline&&!ui.id('#persistence','p').textContent.includes('共享数据已载入')&&!ui.id('#persistence','p').textContent.includes('已连接共享数据'))await new Promise(resolve=>setTimeout(resolve,5));
      return {...ui,channel};
    };
    const tasksFirst=await runDemo('tasks','a');
    assert.match(tasksFirst.id('#persistence','p').textContent,/已连接共享数据/);
    const add=tasksFirst.id('#add','form');add.onsubmit({preventDefault(){}}); // empty task is rejected and does not write
    const board=tasksFirst.id('#board','div'),allNodes=nodes=>nodes.flatMap(node=>[node,...allNodes(node.children??[])]),next=allNodes(board.children).find(node=>node.textContent==='下一步 →');
    assert.ok(next?.onclick);
    next.onclick();
    await new Promise(resolve=>setTimeout(resolve,650));
    const persisted=await h.call(h.body('get',app.appId,app.currentVersion,'demo.tasks.v1'),{visitor:'b'});
    assert.equal(persisted.data.value[0].status,1);
    const tasksSecond=await runDemo('tasks','b');
    assert.ok(tasksSecond.id('#board','div').children[1].children.some(card=>card.children?.some(child=>child.textContent==='整理本周灵感')));
    const taskRevision=persisted.data.revision,failedSave=await runDemo('tasks','a',{set:async()=>{throw new Error('storage offline')}}),failedNodes=allNodes(failedSave.id('#board','div').children),failedNext=failedNodes.find(node=>node.textContent==='下一步 →');failedNext.onclick();await new Promise(resolve=>setTimeout(resolve,650));assert.match(failedSave.id('#persistence','p').textContent,/请保留当前内容并刷新，再读取最新版共享数据/);assert.equal((await h.call(h.body('get',app.appId,app.currentVersion,'demo.tasks.v1'),{visitor:'b'})).data.revision,taskRevision);

    for (const [kind,key,value] of [['budget','demo.budget.v1',{limit:2345,expenses:[1,2,3,4]}],['timer','demo.timer.v1',{duration:300,remaining:240,running:false,endsAt:null}]]) {
      const stored=await h.call(h.body('set',app.appId,app.currentVersion,key,{value,expectedRevision:0}),{visitor:'a'});assert.equal(stored.status,200);
      const ui=await runDemo(kind,'b');
      if(kind==='budget'){assert.equal(ui.inputs[0].value,'2345');assert.deepEqual(ui.inputs.slice(1).map(input=>input.value),['1','2','3','4']);}
      else assert.equal(ui.id('#clock','div').textContent,'04:00');
    }
    const beforeExpiry=await h.call(h.body('get',app.appId,app.currentVersion,'demo.timer.v1'),{visitor:'a'}),expired={duration:300,remaining:90,running:true,endsAt:Date.now()-1000};assert.equal((await h.call(h.body('set',app.appId,app.currentVersion,'demo.timer.v1',{value:expired,expectedRevision:beforeExpiry.data.revision}),{visitor:'a'})).status,200);const expiredUi=await runDemo('timer','b');assert.equal(expiredUi.id('#clock','div').textContent,'00:00');assert.equal(expiredUi.id('#status','p').textContent,'这一段已完成，给自己一点掌声！');assert.equal((await h.call(h.body('get',app.appId,app.currentVersion,'demo.timer.v1'),{visitor:'a'})).data.revision,beforeExpiry.data.revision+1);
  } finally { h.sqlite.close(); }
});
