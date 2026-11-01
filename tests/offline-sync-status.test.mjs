import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadComponent(file, exports) {
  const id = `offline-component-${Date.now()}-${Math.random()}`;
  globalThis[id] = exports;
  const previousReact = globalThis.React;
  globalThis.React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
  let source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  source = source.replace("import { useHostLocale } from './HostLocaleProvider';", `const useHostLocale=globalThis[${JSON.stringify(id)}].useHostLocale;`);
  source = source.replace("import { Cloud, CloudOff, RotateCw, TriangleAlert } from 'lucide-react';", 'const Icon=()=>null;const Cloud=Icon,CloudOff=Icon,RotateCw=Icon,TriangleAlert=Icon;');
  source = source.replace("import styles from './OfflineSyncStatus.module.css';", 'const styles=new Proxy({}, {get:(_,key)=>String(key)});');
  source = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const { default: component } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return { component, dispose() { delete globalThis[id]; if (previousReact === undefined) delete globalThis.React; else globalThis.React = previousReact; } };
}

function collect(tree) { const nodes=[]; function visit(value) { if (Array.isArray(value)) { value.forEach(visit); return; } if (!value || typeof value !== 'object') return; nodes.push(value); visit(value.children); } visit(tree); return nodes; }
function button(tree, label) { return collect(tree).find(node => node.type === 'button' && (node.children ?? []).some(child => child === label)); }

test('offline sync status keeps local changes and requires deliberate manual sync', async () => {
  const useHostLocale = () => ({ t: (key, params = {}) => String(key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`) });
  const { component: OfflineSyncStatus, dispose } = await loadComponent('app/components/OfflineSyncStatus.tsx', { useHostLocale });
  try {
    const calls=[];
    const base={ready:true,pendingCount:2,conflictCount:0,storage:'indexeddb',onSync:()=>calls.push('sync'),onOpenConflicts:()=>calls.push('conflicts')};
    const offline=OfflineSyncStatus({...base,status:'offline'});
    assert.match(collect(offline).map(node=>node.children).flat(2).filter(value=>typeof value==='string').join(' '),/联网后可手动同步/);
    const offlineSync=button(offline,'手动同步');
    assert.equal(offlineSync.props.disabled,true);
    assert.deepEqual(calls,[]);

    const online=OfflineSyncStatus({...base,status:'online'});
    button(online,'手动同步').props.onClick();
    assert.deepEqual(calls,['sync']);

    const conflict=OfflineSyncStatus({...base,status:'online',conflictCount:1});
    assert.equal(button(conflict,'手动同步').props.disabled,true);
    button(conflict,'打开冲突列表').props.onClick();
    assert.deepEqual(calls,['sync','conflicts']);

    const unavailable=OfflineSyncStatus({...base,status:'offline',storage:'unavailable'});
    assert.match(collect(unavailable).map(node=>node.children).flat(2).filter(value=>typeof value==='string').join(' '),/无法保证断网时保存内容/);
    assert.equal(button(unavailable,'手动同步').props.disabled,true);
  } finally { dispose(); }
});
