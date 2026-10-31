import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../app/components/PalettePicker.tsx', import.meta.url), 'utf8');
let fixtureId = 0;

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, event) { listeners.get(type)?.(event); },
  };
}

async function makePicker() {
  const id = `palette-picker-test-${++fixtureId}`;
  const oldGlobals = { document: globalThis.document, window: globalThis.window, Node: globalThis.Node };
  const summary = { focusCalls: 0, focus() { this.focusCalls++; } };
  class MockNode {}
  class MockDetails extends MockNode {
    open = true;
    contains(node) { return node === this || node === summary || node?.insideRoot === true; }
    querySelector(selector) { return selector === 'summary' ? summary : null; }
  }
  const details = new MockDetails();
  const documentTarget = target();
  const windowTarget = target();
  const effects = [];
  const storedWrites = [];
  const calls = { preview: [], clear: 0 };
  let stored = 'slate';
  let preview = null;
  const styles = new Proxy({}, { get: (_target, name) => String(name) });
  const React = {
    createElement(type, props, ...children) { return { type, props: props ?? {}, children }; },
    useRef(initial) { return { current: initial === null ? details : initial }; },
    useEffect(effect) { effects.push(effect); },
  };
  globalThis.document = documentTarget;
  globalThis.window = windowTarget;
  globalThis.Node = MockNode;
  globalThis[id] = {
    React,
    Palette: () => null,
    useHostLocale: () => ({ locale: 'zh-CN' }),
    PALETTE_OPTIONS: [
      { value: 'blue', zh: '雾蓝', en: 'Mist blue' },
      { value: 'violet', zh: '鸢紫', en: 'Iris violet' },
      { value: 'mint', zh: '薄荷', en: 'Soft mint' },
      { value: 'slate', zh: '银灰', en: 'Silver slate' },
    ],
    usePalettePreference: () => ({
      get preference() { return stored; },
      setPreference(value) { stored = value; storedWrites.push(value); preview = null; },
      previewPalette(value) { preview = value; calls.preview.push(value); },
      clearPreview() { preview = null; calls.clear++; },
    }),
    styles,
  };
  let moduleSource = source
    .replace("import { useEffect, useRef } from 'react';", `const React=globalThis[${JSON.stringify(id)}].React;const {useEffect,useRef}=React;`)
    .replace("import { Palette } from 'lucide-react';", `const Palette=globalThis[${JSON.stringify(id)}].Palette;`)
    .replace("import { useHostLocale } from '@/app/components/HostLocaleProvider';", `const useHostLocale=globalThis[${JSON.stringify(id)}].useHostLocale;`)
    .replace("import { PALETTE_OPTIONS } from '@/lib/motes/palette-preferences';", `const PALETTE_OPTIONS=globalThis[${JSON.stringify(id)}].PALETTE_OPTIONS;`)
    .replace("import { usePalettePreference } from './PalettePreferenceProvider';", `const usePalettePreference=globalThis[${JSON.stringify(id)}].usePalettePreference;`)
    .replace("import styles from './PalettePicker.module.css';", `const styles=globalThis[${JSON.stringify(id)}].styles;`);
  moduleSource = ts.transpileModule(moduleSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const { default: PalettePicker } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  const tree = PalettePicker();
  const cleanups = effects.map(effect => effect()).filter(Boolean);
  function find(node, predicate) {
    if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return null; }
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    return find(node.children, predicate);
  }
  const labels = [];
  function collect(node) {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'label') labels.push(node);
    collect(node.children);
  }
  collect(tree);
  const inputFor = label => find(label.children, node => node.type === 'input');
  return {
    tree, details, summary, labels, inputFor, calls, storedWrites,
    get stored() { return stored; }, get preview() { return preview; },
    dispose() {
      cleanups.forEach(cleanup => cleanup());
      delete globalThis[id];
      for (const [key, value] of Object.entries(oldGlobals)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    },
  };
}

test('hover previews without saving and mouse leave clears preview and closes the picker', async () => {
  const picker = await makePicker();
  try {
    const card = picker.labels.find(label => picker.inputFor(label).props.value === 'blue');
    card.props.onPointerEnter({ pointerType: 'mouse' });
    assert.equal(picker.preview, 'blue');
    assert.deepEqual(picker.storedWrites, []);
    picker.tree.props.onPointerLeave({ pointerType: 'mouse', relatedTarget: null, currentTarget: picker.details });
    assert.equal(picker.preview, null);
    assert.equal(picker.details.open, false);
    assert.deepEqual(picker.storedWrites, []);
  } finally { picker.dispose(); }
});

test('radio change commits the palette and closes the picker', async () => {
  const picker = await makePicker();
  try {
    picker.calls.preview.length = 0;
    picker.calls.clear = 0;
    const radio = picker.inputFor(picker.labels.find(label => picker.inputFor(label).props.value === 'violet'));
    radio.props.onChange();
    assert.equal(picker.stored, 'violet');
    assert.deepEqual(picker.storedWrites, ['violet']);
    assert.equal(picker.preview, null);
    assert.equal(picker.details.open, false);
    assert.equal(picker.summary.focusCalls, 1);
  } finally { picker.dispose(); }
});

test('touch focus does not preview before an explicit radio selection', async () => {
  const picker = await makePicker();
  try {
    const label = picker.labels.find(item => picker.inputFor(item).props.value === 'blue');
    label.props.onPointerDown();
    label.props.onFocus();
    assert.equal(picker.preview, null);
    assert.deepEqual(picker.storedWrites, []);
    picker.inputFor(label).props.onChange();
    assert.equal(picker.stored, 'blue');
    assert.deepEqual(picker.storedWrites, ['blue']);
  } finally { picker.dispose(); }
});

test('Escape, focus leaving the picker, outside pointer, and window blur all clear preview', async () => {
  const picker = await makePicker();
  try {
    let prevented = 0;
    let stopped = 0;
    picker.calls.preview.length = 0;
    const detailsProps = picker.tree.props;
    detailsProps.onKeyDown({ key: 'Escape', currentTarget: picker.details, preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
    assert.equal(picker.details.open, false);
    assert.equal(picker.summary.focusCalls, 1);
    assert.equal(prevented, 1);
    assert.equal(stopped, 1);

    picker.details.open = true;
    picker.calls.preview.length = 0;
    picker.labels[0].props.onFocus();
    detailsProps.onBlur({ relatedTarget: null, currentTarget: picker.details });
    assert.equal(picker.preview, null);
    assert.equal(picker.details.open, false);

    picker.details.open = true;
    picker.labels[0].props.onPointerEnter({ pointerType: 'mouse' });
    picker.details.open = true;
    globalThis.window.dispatch('blur');
    assert.equal(picker.preview, null);
    assert.equal(picker.details.open, false);

    picker.details.open = true;
    picker.labels[0].props.onPointerEnter({ pointerType: 'mouse' });
    globalThis.document.dispatch('pointerdown', { target: {} });
    assert.equal(picker.preview, null);
    assert.equal(picker.details.open, false);
    assert.deepEqual(picker.storedWrites, []);
  } finally { picker.dispose(); }
});
