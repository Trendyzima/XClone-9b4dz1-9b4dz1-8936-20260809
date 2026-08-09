/**
 * vite-fix-loader.mjs  v7
 *
 * Node.js ESM load hook — registered via module.register() in vite.config.cjs.
 *
 * KEY CHANGES over v6:
 *   - Extended CORRUPT_RE to handle ALL patcher fallback types:
 *       ??"string"  ??''  ??{}  ??[]  ??null  ??undefined  ??false  ??0
 *     Previously only quoted-string fallbacks were matched, so ??{} corruption
 *     (which causes "Unexpected token '{'" at toJSON() etc.) was not fixed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Matches patcher-injected ?? corruption — tight syntax (NO spaces around ??)
// so we never accidentally touch legitimate  value ?? "default"  expressions.
//
// Patcher injects these after identifiers / calls in parameter lists:
//   identifier??"string"   identifier()??"str"   (quoted strings)
//   identifier??{}         identifier()??{}       (empty object  — NEW in v7)
//   identifier??[]         identifier()??[]       (empty array   — NEW in v7)
//   identifier??null       identifier??undefined  (null/undef    — NEW in v7)
const CORRUPT_RE =
  /\b(\w+(?:\([^)]*\))*)\?\?(?:["'][^"']*["']|\{\s*\}|\[\s*\]|null\b|undefined\b|false\b|0\b)/g;

function applyFix(source) {
  let fixed = source.replace(CORRUPT_RE, '$1');

  // Belt-and-suspenders for the specific replaceDefine(code??"", ...) variants
  // that the OnSpace patcher injects in replaceDefine's parameter list:
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

  // Belt-and-suspenders for ??{} variants in known problem spots
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?\{\s*\}/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?\[\s*\]/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?null\b/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?undefined\b/g, '$1');

  return fixed;
}

// ── Initialization hook ────────────────────────────────────────────────────
// Called once the hook worker thread is fully up.
// Signals the main thread (which may be blocked on Atomics.wait) to continue.
export function initialize(data) {
  try {
    const sab = data?.sab;
    if (sab instanceof SharedArrayBuffer) {
      const arr = new Int32Array(sab);
      Atomics.store(arr, 0, 1);
      Atomics.notify(arr, 0, Infinity);
      process.stderr.write('[vite-fix] ✅ hook worker signalled main thread\n');
    } else {
      process.stderr.write('[vite-fix] ✅ hook worker initialized (no SAB)\n');
    }
  } catch (e) {
    process.stderr.write('[vite-fix] ⚠️ initialize error: ' + String(e) + '\n');
  }
}

// ── Load hook ──────────────────────────────────────────────────────────────
export async function load(url, context, nextLoad) {

  // Fast-pass: only care about Vite's own node-layer chunks
  if (!url.startsWith('file:') || !url.includes('/vite/dist/node/')) {
    return nextLoad(url, context);
  }

  // Read raw source from disk
  let source;
  try {
    source = readFileSync(fileURLToPath(url), 'utf8');
  } catch (e) {
    process.stderr.write('[vite-fix] ⚠️ readFileSync failed: ' + e.message + '\n');
    return nextLoad(url, context);
  }

  // Only intercept when corruption is present — check for tight ?? sequences
  // (patcher never adds spaces, so  identifier??  without spaces = corruption)
  const hasCorruption = /\w\?\?["'{}\[n]/.test(source);
  if (!hasCorruption) {
    return nextLoad(url, context);
  }

  const fixed = applyFix(source);

  if (fixed !== source) {
    process.stderr.write(
      '[vite-fix] 🔧 patched ?? corruption in ' + url.split('/').pop() + '\n'
    );
    return {
      shortCircuit: true,
      format: 'module',   // Vite's dist/node chunks are always ESM
      source: fixed,
    };
  }

  // Contains tight ?? but our regex didn't match → might be legit edge case.
  // Log and fall through to nextLoad so we don't accidentally break anything.
  process.stderr.write(
    '[vite-fix] ℹ️  tight ?? found but no pattern matched in ' +
      url.split('/').pop() + ' — passing through\n'
  );
  return nextLoad(url, context);
}
