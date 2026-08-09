/**
 * vite-fix-loader.mjs  v6
 *
 * Node.js ESM load hook — registered via module.register() in vite.config.cjs.
 *
 * KEY CHANGES over v5:
 *   - Only intercept files that ACTUALLY contain ?? corruption.
 *     Previously we returned shortCircuit:true for EVERY /vite/dist/node/ file,
 *     which caused Node to mis-classify format on clean/CJS chunk files, potentially
 *     breaking the hook chain silently.
 *   - Clean files now pass through to nextLoad() normally so format detection works.
 *   - Atomics signalling is kept as an optional fast-path; if SharedArrayBuffer
 *     transfer fails the hook still works (just without the sync guarantee).
 *   - Expanded CORRUPT_RE handles  identifier()??""  and  identifier(a,b)??""  patterns.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Matches patcher-injected ?? corruption (no spaces around ?? to avoid touching
// legitimate  value ?? "default"  nullish coalescing expressions):
//   identifier??"string"           →  identifier
//   identifier()??"string"         →  identifier()
//   identifier(a, b)??"string"     →  identifier(a, b)
const CORRUPT_RE = /\b(\w+(?:\([^)]*\))*)\?\?["'][^"']*["']/g;

function applyFix(source) {
  let fixed = source.replace(CORRUPT_RE, '$1');

  // Belt-and-suspenders for the specific replaceDefine(code??"", ...) variants
  // that the OnSpace patcher injects in replaceDefine's parameter list:
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

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
      // No SAB passed — just log that we are alive
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

  // Read the raw bytes from disk so we can inspect for corruption
  let source;
  try {
    source = readFileSync(fileURLToPath(url), 'utf8');
  } catch (e) {
    // Can't read → let nextLoad handle it (will likely also fail, but that's the
    // correct error to surface rather than a confusing hook failure)
    process.stderr.write('[vite-fix] ⚠️ readFileSync failed: ' + e.message + '\n');
    return nextLoad(url, context);
  }

  // ── KEY CHANGE: only short-circuit when corruption is actually present ─────
  // For clean files we call nextLoad() normally so Node can auto-detect format
  // (CommonJS vs ESM) without us guessing wrong.
  if (!source.includes('??')) {
    return nextLoad(url, context);
  }

  const fixed = applyFix(source);

  if (fixed !== source) {
    process.stderr.write(
      '[vite-fix] 🔧 patched ?? corruption in ' + url.split('/').pop() + '\n'
    );
  } else {
    // Contains '??' but our regex didn't match — might be legitimate code.
    // Fall back to nextLoad so we don't force the wrong format.
    process.stderr.write(
      '[vite-fix] ℹ️  ?? found but no patcher pattern matched in ' +
        url.split('/').pop() + ' — passing through\n'
    );
    return nextLoad(url, context);
  }

  // Return the in-memory fixed source, bypassing the (potentially corrupted) disk file.
  return {
    shortCircuit: true,
    format: 'module',   // Vite's dist/node chunks are always ESM
    source: fixed,
  };
}
