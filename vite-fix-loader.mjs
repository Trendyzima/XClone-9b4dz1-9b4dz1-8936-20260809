/**
 * vite-fix-loader.mjs  v9
 *
 * Node.js ESM load hook — registered via module.register() in vite.config.cjs.
 *
 * KEY CHANGE in v9:
 *   Switched to a lookbehind-based regex for the primary corruption pass:
 *
 *     (?<=[^\s])\?\?\s*(?:...)
 *
 *   The lookbehind `(?<=[^\s])` means "?? NOT preceded by whitespace".
 *   This is the definitive discriminator:
 *     - Patcher injections:  identifier??value   (no space before ??)
 *     - Legitimate code:     identifier ?? value (space before ??)
 *
 *   Also added `gs` flags (dotAll + global) so multi-line injections like
 *     toJSON()??\n  {}
 *   are caught even when ?? and the value span multiple lines.
 *
 *   The `{}` pattern now uses `\{(?:[^{}]|\{[^{}]*\})*\}` to match
 *   non-empty object literals (patcher sometimes injects ??{content}).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Primary corruption regex ─────────────────────────────────────────────────
//
// Matches:  <non-whitespace>??<optional-ws><trivial-value>
//   where trivial-value is: quoted string, object literal (any depth 1),
//                           array, null, undefined, false, or 0
//
// Flags: g (global) + s (dotAll — . matches \n, helps for multiline patterns)
//
// The lookbehind (?<=[^\s]) ensures we only remove tight-?? (no space before),
// which is the patcher's signature. Legitimate  value ?? fallback  has a space.
//
const CORRUPT_RE = /(?<=[^\s])\?\?\s*(?:"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\}|\[\s*\]|null\b|undefined\b|false\b|0\b)/gs;

function applyFix(source) {
  // ── Pass 1: Lookbehind-based tight-?? removal (primary) ──────────────────
  // Removes identifier??value where ?? has no whitespace before it.
  // Uses gs flags to catch multi-line injections.
  let fixed = source.replace(CORRUPT_RE, '');

  // ── Pass 2: Belt-and-suspenders for the replaceDefine family ─────────────
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

  // ── Pass 3: Identifier-capture regex for any remaining cases ─────────────
  // Keeps the identifier, removes ??value.
  fixed = fixed.replace(
    /\b(\w+(?:\([^)]*\))*)\?\?\s*(?:"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\}|\[\s*\]|null\b|undefined\b|false\b|0\b)/g,
    '$1'
  );

  return fixed;
}

// ── Initialization hook ──────────────────────────────────────────────────────
// Called once by the hook worker thread when it is fully initialised.
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

// ── Load hook ────────────────────────────────────────────────────────────────
export async function load(url, context, nextLoad) {

  // Fast-pass: only intercept Vite's own node-layer chunks
  if (!url.startsWith('file:') || !url.includes('/vite/dist/node/')) {
    return nextLoad(url, context);
  }

  const fname = url.split('/').pop();

  // ── Strategy 1: nextLoad → fix in memory ─────────────────────────────────
  // nextLoad reads the file but does NOT compile it, so a corrupted file is
  // returned as a source string without throwing a SyntaxError.
  // We then fix the string and return it for Node to compile.
  let result;
  try {
    result = await nextLoad(url, context);
  } catch (loadErr) {
    // nextLoad failed — fall back to direct disk read (Strategy 2)
    process.stderr.write(
      '[vite-fix] ⚠️ nextLoad threw for ' + fname +
      ' (' + (loadErr instanceof Error ? loadErr.message : String(loadErr)) + ')' +
      ' — trying disk fallback\n'
    );
    try {
      const diskSrc = readFileSync(fileURLToPath(url), 'utf8');
      const fixed = applyFix(diskSrc);
      if (fixed !== diskSrc) {
        process.stderr.write('[vite-fix] 🔧 disk-fallback patched ' + fname + '\n');
      }
      return { shortCircuit: true, format: 'module', source: fixed };
    } catch (diskErr) {
      throw loadErr; // both strategies failed — re-throw original
    }
  }

  // Extract source string from the result
  let sourceStr;
  try {
    sourceStr = typeof result.source === 'string'
      ? result.source
      : Buffer.from(result.source).toString('utf8');
  } catch {
    return result; // can't decode source — pass through unchanged
  }

  // Quick bail-out: no ?? at all → nothing to fix
  if (!sourceStr.includes('??')) {
    return result;
  }

  // Apply fix
  const fixed = applyFix(sourceStr);

  if (fixed === sourceStr) {
    // Had ??, but our patterns didn't match — log for debugging
    // Find first ?? and log surrounding context
    const idx = sourceStr.indexOf('??');
    const ctx = sourceStr.slice(Math.max(0, idx - 40), idx + 60).replace(/\n/g, '↵');
    process.stderr.write(
      '[vite-fix] ℹ️  ?? found but no pattern matched in ' + fname +
      ' — context: …' + ctx + '…\n'
    );
    return result;
  }

  // Count replacements made
  const origCount = (sourceStr.match(/\?\?/g) || []).length;
  const fixedCount = (fixed.match(/\?\?/g) || []).length;
  process.stderr.write(
    '[vite-fix] 🔧 in-memory patched ' + fname +
    ' (removed ' + (origCount - fixedCount) + ' of ' + origCount + ' ?? occurrences)\n'
  );

  // Return fixed source with the same format nextLoad determined
  return { ...result, source: fixed };
}
