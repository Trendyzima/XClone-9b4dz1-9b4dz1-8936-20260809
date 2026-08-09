/**
 * vite-fix-loader.mjs  v10
 *
 * Node.js ESM load hook — registered via module.register() in vite.config.cjs.
 *
 * ROOT CAUSE OF `toJSON() {` ERROR (identified in v10):
 *   The patcher injects `??` before a method body brace:
 *     toJSON()?? {            ← patcher adds ??  before the opening {
 *       return {a: {b: 1}};   ← body has 3 levels of nested braces
 *     }
 *   Our previous regex `\{(?:[^{}]|\{[^{}]*\})*\}` only handles 2 brace
 *   nesting levels.  When the body has 3+ levels it fails to match, the ??
 *   is left in place, and Node parses `toJSON()` as the ?? right-operand,
 *   making the `{` of the body an "Unexpected token".
 *
 * FIX in v10:
 *   Replace the regex brace pattern with a linear CHARACTER-BY-CHARACTER
 *   BRACE COUNTER that handles ARBITRARY nesting depth and is string-aware
 *   (won't miscount braces inside "..." or '...' literals).
 *
 *   Also added:
 *   - End-of-line ?? removal: `identifier??\n` → `identifier\n`
 *     Handles the case where ?? was injected at the very end of a line with
 *     the next line's real code becoming the accidental right operand.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// fixTightDoubleQuestion(src)
//
// Linear O(n) scanner.  Finds every tight `??` (no whitespace before it) and
// removes `?? <value>` where <value> is one of:
//   • "..." or '...' — quoted string
//   • {...}          — object literal / block with ARBITRARY nesting
//   • []             — empty array
//   • null | undefined | false | 0
//
// If none of the above patterns follow, only the ?? itself is removed
// (handles end-of-line injections where the next line is the original code).
// ─────────────────────────────────────────────────────────────────────────────
function fixTightDoubleQuestion(src) {
  const n = src.length;
  let out = '';
  let i = 0;

  while (i < n) {
    // Look for ?? where the preceding char is not whitespace
    if (
      src[i] === '?' &&
      i + 1 < n && src[i + 1] === '?' &&
      i > 0 && !/[\s]/.test(src[i - 1])
    ) {
      let j = i + 2; // position right after ??

      // Skip horizontal whitespace (spaces/tabs) after ??
      // NOTE: we intentionally do NOT skip newlines here for the
      // end-of-line detection below.
      while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;

      let endPos = -1; // will be set to first position AFTER the consumed pattern

      if (j < n) {
        const c = src[j];

        if (c === '\r' || c === '\n') {
          // ?? at end of line — remove only the ??  (the newline stays)
          endPos = i + 2; // just past the ??
        } else if (c === '{') {
          // ── Brace counting with string-literal awareness ───────────────
          let depth = 1;
          let k = j + 1;
          let inStr = false;
          let strCh = '';

          while (k < n && depth > 0) {
            const cc = src[k];
            if (inStr) {
              if (cc === '\\') {
                k++; // skip escaped char
              } else if (cc === strCh) {
                inStr = false;
              }
            } else {
              if (cc === '"' || cc === "'" || cc === '`') {
                inStr = true;
                strCh = cc;
              } else if (cc === '{') {
                depth++;
              } else if (cc === '}') {
                depth--;
              }
            }
            k++;
          }

          if (depth === 0) {
            endPos = k; // k is now one past the matching }
          }
        } else if (c === '"' || c === "'") {
          // ── Quoted string ─────────────────────────────────────────────
          const q = c;
          let k = j + 1;
          while (k < n && src[k] !== q) {
            if (src[k] === '\\') k++; // skip escape
            k++;
          }
          if (k < n) endPos = k + 1; // +1 to include closing quote
        } else if (c === '[') {
          // ── Empty array [] ────────────────────────────────────────────
          let k = j + 1;
          while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
          if (k < n && src[k] === ']') endPos = k + 1;
        } else {
          // ── Keywords: null | undefined | false | 0 ───────────────────
          const rest = src.slice(j);
          const m = rest.match(/^(null|undefined|false|0)(?!\w)/);
          if (m) endPos = j + m[1].length;
        }
      } else {
        // ?? at very end of file — remove it
        endPos = i + 2;
      }

      if (endPos >= 0) {
        // Consumed — advance past the pattern, do NOT emit ??<value>
        i = endPos;
      } else {
        // No recognised pattern — emit the first ? and retry from the second ?
        out += src[i];
        i++;
      }
      continue;
    }

    out += src[i];
    i++;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// applyFix(source)  — multi-pass orchestrator
// ─────────────────────────────────────────────────────────────────────────────
function applyFix(source) {
  // ── Pass 1: character-by-character tight-?? removal (handles all nesting) ─
  let fixed = fixTightDoubleQuestion(source);

  // ── Pass 2: belt-and-suspenders for replaceDefine variants ────────────────
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

  // ── Pass 3: regex sweep for any remaining tight-?? with simple right sides ─
  //    (catches edge cases the char scanner may have skipped)
  fixed = fixed.replace(
    /(?<=[^\s])\?\?\s*(?:"[^"]*"|'[^']*'|\[\s*\]|null\b|undefined\b|false\b|0\b)/g,
    ''
  );

  // ── Pass 4: identifier-capture fallback ───────────────────────────────────
  fixed = fixed.replace(
    /\b(\w+(?:\([^)]*\))*)\?\?\s*(?:"[^"]*"|'[^']*'|\[\s*\]|null\b|undefined\b|false\b|0\b)/g,
    '$1'
  );

  return fixed;
}

// ─────────────────────────────────────────────────────────────────────────────
// initialize — called by the hook worker thread once it is ready
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// load hook — intercepts every Vite node-chunk and fixes it in memory
// ─────────────────────────────────────────────────────────────────────────────
export async function load(url, context, nextLoad) {
  // Fast-pass: only intercept Vite's own node-layer chunks
  if (!url.startsWith('file:') || !url.includes('/vite/dist/node/')) {
    return nextLoad(url, context);
  }

  const fname = url.split('/').pop();

  // Strategy 1: call nextLoad to get raw (possibly corrupted) source,
  // then fix it in memory before Node compiles it.
  let result;
  try {
    result = await nextLoad(url, context);
  } catch (loadErr) {
    // nextLoad itself threw — fall back to reading from disk
    process.stderr.write(
      '[vite-fix] ⚠️ nextLoad threw for ' + fname +
      ' (' + (loadErr instanceof Error ? loadErr.message : String(loadErr)) +
      ') — trying disk fallback\n'
    );
    try {
      const diskSrc = readFileSync(fileURLToPath(url), 'utf8');
      const fixed = applyFix(diskSrc);
      if (fixed !== diskSrc) {
        process.stderr.write('[vite-fix] 🔧 disk-fallback patched ' + fname + '\n');
      }
      return { shortCircuit: true, format: 'module', source: fixed };
    } catch {
      throw loadErr;
    }
  }

  // Decode source
  let sourceStr;
  try {
    sourceStr = typeof result.source === 'string'
      ? result.source
      : Buffer.from(result.source).toString('utf8');
  } catch {
    return result;
  }

  // Quick bail-out
  if (!sourceStr.includes('??')) return result;

  const fixed = applyFix(sourceStr);

  if (fixed === sourceStr) {
    // ?? present but nothing matched — log context for diagnosis
    const idx = sourceStr.indexOf('??');
    const ctx = sourceStr.slice(Math.max(0, idx - 50), idx + 80).replace(/\n/g, '↵');
    process.stderr.write(
      '[vite-fix] ⚠️ ?? found but unfixed in ' + fname +
      '\n         context: …' + ctx + '…\n'
    );
    return result;
  }

  const removed = (sourceStr.match(/\?\?/g) || []).length - (fixed.match(/\?\?/g) || []).length;
  process.stderr.write(
    '[vite-fix] 🔧 in-memory patched ' + fname + ' (removed ' + removed + ' ?? occurrences)\n'
  );

  return { ...result, source: fixed };
}
