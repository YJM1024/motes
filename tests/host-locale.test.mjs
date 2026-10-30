import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const cache=new Map();async function moduleUrl(name){if(cache.has(name))return cache.get(name);let source=await readFile(new URL('../lib/motes/locale/'+name+'.ts',import.meta.url),'utf8');for(const m of [...source.matchAll(/from\s+(['"])\.\/([^'"]+)\1/g)])source=source.replaceAll(m[1]+'./'+m[2]+m[1],JSON.stringify(await moduleUrl(m[2])));const url='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');cache.set(name,url);return url;}
const locale=await import(await moduleUrl('index'));
test('host locale accepts only the two explicit preferences and keeps its own browser key',()=>{for(const value of [null,undefined,'fr','EN',{},'zh-CN'])assert.equal(locale.parseHostLocale(value),'zh-CN');assert.equal(locale.parseHostLocale('en'),'en');assert.equal(locale.HOST_LOCALE_KEY,'motes:host-locale:v1');});
test('named interpolation is plain text and does not recursively interpret user values',()=>{assert.equal(locale.formatHostMessage('App {name}: {count}; {missing}',{name:'<script>{count}</script>',count:2}), 'App <script>{count}</script>: 2; {missing}');assert.equal(locale.formatHostMessage('{toString}'),'{toString}');});
test('every English catalog preserves the exact named parameters of the source phrase',()=>{const tokens=text=>[...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match=>match[1]).sort();for(const [zh,en]of Object.entries(locale.hostMessages)){assert.equal(typeof en,'string');assert.ok(en.trim(),zh);assert.deepEqual(tokens(en),tokens(zh),zh);}});

const notices=await import(await moduleUrl('home-notices'));
test('only bounded known host notices are translated; unknown errors and user content remain verbatim',()=>{assert.equal(notices.homeNotice('en','正在核对刷新前的原请求，请勿重复发送。'),'Checking the original request from before refresh. Do not send it again.');assert.equal(notices.homeNotice('en','我的应用：旅行预算规划'),'我的应用：旅行预算规划');assert.equal(notices.homeNotice('en','原始API错误：unknown code'),'原始API错误：unknown code');assert.equal(notices.homeNotice('en','填入后需求将超过 4000 字，请替换当前需求或先精简草稿。'),'The result would exceed 4000 characters. Replace the current request or shorten the draft first.');});
