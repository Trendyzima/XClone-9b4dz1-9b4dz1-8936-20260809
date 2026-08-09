/**
 * vite-fix-loader.mjs  v5
 *
 * Node.js ESM load hook — registered via module.register() in vite.config.cjs.
 *
 * KEY CHANGE over v4:
 *   Added `initialize` export that signals the main thread via SharedArrayBuffer
 *   + Atomics.notify() so vite.config.cjs can do Atomics.wait() and be SURE
 *   the hook worker is alive before Vite starts importing its heavy chunks.
 *   This eliminates the race window where dep-C6uTJdX2.js was imported before
 *   the hook was ready (causing "Unexpected token '??'" to reach V8).
 *
 * CORRUPT_RE handles all known patcher patterns:
 *   identifier??"string"           →  identifier
 *   identifier()??"string"         →  identifier()
 *   identifier(a, b)??"string"     →  identifier(a, b)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Matches patcher-injected ?? corruption (tight — no spaces around ??):
const CORRUPT_RE = /\b(\w+(?:\([^)]*\))*)\?\?["'][^"']*["']/g;

// ── Initialization hook ────────────────────────────────────────────────────
// Called by the hook worker once it is fully initialized.
// Signals the main thread (which is blocked on Atomics.wait) that the hook
// is ready to intercept load() calls.
export function initialize(data) {
  try {
    const sab = data?.sab;
    if (sab instanceof SharedArrayBuffer) {
      const arr = new Int32Array(sab);
      Atomics.store(arr, 0, 1);
      Atomics.notify(arr, 0, Infinity);
      process.stderr.write('[vite-fix-loader] ✅ hook worker initialized, main thread unblocked\n');
    }
  } catch (e) {
    process.stderr.write('[vite-fix-loader] ⚠️ initialize error: ' + e.message + '\n');
  }
}

// ── Load hook ──────────────────────────────────────────────────────────────
export async function load(url, context, nextLoad) {

  // Fast pass: only intercept Vite's own node-layer chunk files
  if (
    !url.startsWith('file:') ||
    !url.includes('/vite/dist/node/')
  ) {
    return nextLoad(url, context);
  }

  // Read the file directly — bypasses nextLoad entirely so we own the source
  let source;
  try {
    source = readFileSync(fileURLToPath(url), 'utf8');
  } catch (e) {
    process.stderr.write(
      '[vite-fix-loader] ⚠️  readFileSync failed for ' +
      url.split('/').pop() + ': ' + e.message + '\n'
    );
    return nextLoad(url, context);
  }

  // Apply corruption fix if needed
  let fixed = source;

  if (source.includes('??')) {
    // Blanket fix: identifier(optional args)??"string" → identifier(optional args)
    fixed = fixed.replace(CORRUPT_RE, '$1');

    // Belt-and-suspenders for the known replaceDefine variants
    if (fixed.includes('replaceDefine(code??')) {
      fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
      fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
      fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
      fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
      fixed = fixed.replace(
        /replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g,
        'replaceDefine(code, '
      );
    }

    if (fixed !== source) {
      process.stderr.write(
        '[vite-fix-loader] ✅ patched ?? corruption in ' +
        url.split('/').pop() + '\n'
      );
    }
  }

  return {
    shortCircuit: true,
    format: 'module',
    source: fixed,
  };
}
