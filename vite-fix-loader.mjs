/**
 * vite-fix-loader.mjs  v8
 *
 * Node.js ESM load hook — registered via module.register() in vite.config.cjs.
 *
 * KEY CHANGE in v8:
 *   Instead of readFileSync + shortCircuit:true, we now call nextLoad() first to
 *   get the raw source text (nextLoad just reads the file — it does NOT compile it),
 *   then fix the source in memory and return the fixed version.
 *
 *   This is the canonical "augment module source" pattern from the Node.js docs and
 *   guarantees we intercept the corrupted source even when the patcher re-corrupts
 *   the file between our disk-fix pass and the moment Node opens the file.
 *
 *   If nextLoad itself throws (edge case where Node refuses to read the file), we
 *   fall back to readFileSync + shortCircuit:true as a last resort.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Matches patcher-injected ?? corruption — tight syntax (NO spaces around ??)
// so we never accidentally touch legitimate  value ?? "default"  expressions.
const CORRUPT_RE =
  /\b(\w+(?:\([^)]*\))*)\?\?(?:["'][^"']*["']|\{\s*\}|\[\s*\]|null\b|undefined\b|false\b|0\b)/g;

function applyFix(source) {
  // Primary pass — covers all patcher fallback types
  let fixed = source.replace(CORRUPT_RE, '$1');

  // Belt-and-suspenders: explicit string splits for the most common pattern
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

  // Extra passes for object/array/null/undefined variants
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?\{\s*\}/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?\[\s*\]/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?null\b/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?undefined\b/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?false\b/g, '$1');

  return fixed;
}

// ── Initialization hook ─────────────────────────────────────────────────────
// Called once the hook worker thread is fully up.
// Signals the main thread (blocked on Atomics.wait) to continue.
export function initialize(data) {
  try {
    const sab = data?.sab;
    if (sab instanceof SharedArrayBuffer) {
      const arr = new Int32Array(sab);
      Atomics.store(arr, 0, 1);
      Atomics.notify(arr, 0, Infinity);
      process.stderr.write('[vite-fix] ✅ hook worker initialised (SAB signal sent)\n');
    } else {
      process.stderr.write('[vite-fix] ✅ hook worker initialised (no SAB)\n');
    }
  } catch (e) {
    process.stderr.write('[vite-fix] ⚠️ initialize error: ' + String(e) + '\n');
  }
}

// ── Load hook ───────────────────────────────────────────────────────────────
export async function load(url, context, nextLoad) {

  // Fast-pass: only intercept Vite's own node-layer chunks
  if (!url.startsWith('file:') || !url.includes('/vite/dist/node/')) {
    return nextLoad(url, context);
  }

  // ── Strategy 1: call nextLoad to get the raw source text, then fix it ──
  // nextLoad() reads the file but does NOT compile it, so a corrupted file
  // is returned as a string without throwing a syntax error.
  let result;
  try {
    result = await nextLoad(url, context);
  } catch (loadErr) {
    // nextLoad failed — fall back to direct disk read (Strategy 2)
    process.stderr.write(
      '[vite-fix] ⚠️ nextLoad threw for ' + url.split('/').pop() +
      ' (' + (loadErr instanceof Error ? loadErr.message : String(loadErr)) + ')' +
      ' — trying disk fallback\n'
    );

    try {
      const diskSrc = readFileSync(fileURLToPath(url), 'utf8');
      const fixed = applyFix(diskSrc);
      process.stderr.write(
        '[vite-fix] 🔧 disk-fallback patched ' + url.split('/').pop() + '\n'
      );
      return { shortCircuit: true, format: 'module', source: fixed };
    } catch (diskErr) {
      // Both strategies failed — re-throw the original error
      throw loadErr;
    }
  }

  // Extract source string from the result
  let sourceStr;
  try {
    sourceStr = typeof result.source === 'string'
      ? result.source
      : Buffer.from(result.source).toString('utf8');
  } catch {
    return result; // Can't decode source — pass through unchanged
  }

  // Quick check: is there any tight-?? corruption?
  if (!sourceStr.includes('??')) {
    return result; // No corruption — pass through unchanged (common path)
  }

  // Apply fix
  const fixed = applyFix(sourceStr);

  if (fixed === sourceStr) {
    // Contains tight ?? but our patterns didn't match — log and pass through
    process.stderr.write(
      '[vite-fix] ℹ️  tight ?? found but no pattern matched in ' +
        url.split('/').pop() + ' — passing through\n'
    );
    return result;
  }

  process.stderr.write(
    '[vite-fix] 🔧 in-memory patched ' + url.split('/').pop() + '\n'
  );

  // Return fixed source with the same format that nextLoad determined
  return { ...result, source: fixed };
}
