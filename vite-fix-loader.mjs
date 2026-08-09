/**
 * vite-fix-loader.mjs  v11
 *
 * Root-cause findings:
 * 1. dep-C6uTJdX2.js is clean at startup; the patcher corrupts it LATER during
 *    the build (after Vite's CJS API has already been required).
 * 2. The file is then imported dynamically by Vite internals via ESM import().
 * 3. Our load hook IS called, but in older attempts we called nextLoad() to get
 *    the source — for CJS-format files, Node's ESM loader returns source=undefined
 *    and the fix was never applied.
 *
 * Fix in v11:
 * - Read the file DIRECTLY FROM DISK (never rely on nextLoad for the source).
 * - Apply the fix in-memory.
 * - ALSO write the fixed content back to disk (so CJS require() also sees the fix).
 * - Return shortCircuit:true with format:'module' and the fixed source.
 *   (The error stack confirms the file is compiled as an ES module via
 *    compileSourceTextModule in node:internal/modules/esm.)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// fixTightDoubleQuestion(src)
//
// Linear O(n) scanner. Removes tight-?? injections:
//   identifier??""   identifier??{}   identifier??[]
//   identifier??null  identifier??undefined  identifier??false  identifier??0
//   identifier??\n   (end-of-line injection)
//
// Handles ARBITRARY brace nesting depth and is string-literal aware.
// ─────────────────────────────────────────────────────────────────────────────
function fixTightDoubleQuestion(src) {
  const n = src.length;
  let out = '';
  let i = 0;

  while (i < n) {
    if (
      src[i] === '?' &&
      i + 1 < n && src[i + 1] === '?' &&
      i > 0 && !/[\s]/.test(src[i - 1])
    ) {
      let j = i + 2;
      while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;

      let endPos = -1;

      if (j >= n) {
        endPos = i + 2;
      } else {
        const c = src[j];

        if (c === '\r' || c === '\n') {
          endPos = i + 2;

        } else if (c === '{') {
          // Check if empty object: ??{}
          let k = j + 1;
          while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
          if (k < n && src[k] === '}') {
            // ??{} — empty object literal, remove whole thing
            endPos = k + 1;
          } else {
            // ??{non-empty block} — brace-counter can silently fail on regex
            // literals (e.g. /\{/g) inside the body, leaving ?? intact.
            // Just remove ?? and keep the { so the block stays valid.
            endPos = i + 2;
          }

        } else if (c === '"' || c === "'") {
          const q = c;
          let k = j + 1;
          while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; }
          if (k < n) endPos = k + 1;

        } else if (c === '[') {
          let k = j + 1;
          while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
          if (k < n && src[k] === ']') endPos = k + 1;

        } else {
          const rest = src.slice(j);
          const m = rest.match(/^(null|undefined|false|0)(?!\w)/);
          if (m) {
            endPos = j + m[1].length;
          } else if (/^[a-zA-Z_$]/.test(c)) {
            // Identifier as right operand (e.g. ??toJSON, ??returnValue).
            // The patcher injects ?? before method/property names in positions
            // that break syntax.  Remove just ?? and preserve the identifier.
            endPos = i + 2;
          }
        }
      }

      if (endPos >= 0) { i = endPos; }
      else { out += src[i]; i++; }
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
  // Pass 1: character-by-character scanner (handles arbitrary nesting)
  let fixed = fixTightDoubleQuestion(source);

  // Pass 2: replaceDefine variants belt-and-suspenders
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

  // Pass 3: regex sweep for remaining simple tight-?? patterns
  fixed = fixed.replace(
    /(?<=[^\s])\?\?\s*(?:"[^"]*"|'[^']*'|\[\s*\]|null\b|undefined\b|false\b|0\b)/g,
    ''
  );

  return fixed;
}

// ─────────────────────────────────────────────────────────────────────────────
// initialize — signals main thread that hook worker is ready
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
    process.stderr.write('[vite-fix] ⚠️  initialize error: ' + String(e) + '\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// load hook — intercepts Vite chunk files and fixes corruption
//
// KEY CHANGES in v11:
// - Read directly from disk (do NOT rely on nextLoad's source — it can be
//   undefined for CJS-format files loaded via ESM dynamic import())
// - ALSO write the fixed content back to disk so that Module._compile and
//   any other CJS loading path also sees the clean version
// - Return shortCircuit:true with format:'module' and the fixed source
//   (confirmed by error stack: compileSourceTextModule in ESM translators)
// ─────────────────────────────────────────────────────────────────────────────
export async function load(url, context, nextLoad) {
  // Fast path: only intercept Vite's own node-layer chunks
  if (!url.startsWith('file:') || !url.includes('/vite/dist/node/')) {
    return nextLoad(url, context);
  }

  const fname = url.split('/').pop();

  // ── Step 1: Read directly from disk ────────────────────────────────────────
  let src;
  try {
    src = readFileSync(fileURLToPath(url), 'utf8');
  } catch (readErr) {
    process.stderr.write('[vite-fix] ⚠️ disk-read failed for ' + fname + ': ' + String(readErr) + '\n');
    return nextLoad(url, context);
  }

  // ── Step 2: Quick bail if clean ─────────────────────────────────────────────
  if (!src.includes('??')) {
    return nextLoad(url, context);
  }

  // ── Step 3: Apply the fix ──────────────────────────────────────────────────
  const fixed = applyFix(src);

  if (fixed === src) {
    // Found ?? but couldn't fix — log context and fall through
    const idx = src.indexOf('??');
    const ctx = src.slice(Math.max(0, idx - 40), idx + 60).replace(/\n/g, '↵');
    process.stderr.write(
      '[vite-fix] ⚠️ ?? unfixed in ' + fname + '\n         context: …' + ctx + '…\n'
    );
    return nextLoad(url, context);
  }

  const removed = (src.match(/\?\?/g) || []).length - (fixed.match(/\?\?/g) || []).length;
  process.stderr.write(
    '[vite-fix] 🔧 fixed ' + fname + ' (' + removed + ' injections removed)\n'
  );

  // ── Step 4: Write back to disk ─────────────────────────────────────────────
  // This ensures Module._compile (CJS path) and any subsequent require() also
  // gets the clean version. Even if this write races with the patcher, the
  // source we return below is already clean for this ESM compilation.
  try {
    writeFileSync(fileURLToPath(url), fixed, 'utf8');
    process.stderr.write('[vite-fix] 💾 wrote fix to disk: ' + fname + '\n');
  } catch (writeErr) {
    process.stderr.write('[vite-fix] ⚠️ disk-write failed: ' + String(writeErr) + '\n');
    // Not fatal — we still return the fixed source via the hook
  }

  // ── Step 5: Return fixed source ────────────────────────────────────────────
  // shortCircuit:true skips remaining hooks and gives Node our fixed source.
  // format:'module' matches what compileSourceTextModule (ESM) expects.
  return { shortCircuit: true, format: 'module', source: fixed };
}
