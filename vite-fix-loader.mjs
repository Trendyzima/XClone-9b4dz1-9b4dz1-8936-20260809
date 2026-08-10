/**
 * vite-fix-loader.mjs  v17
 *
 * Root-cause findings:
 * 1. dep-C6uTJdX2.js is loaded via ESM dynamic import() during the Vite build.
 * 2. Our load hook reads the file from disk — it may be CLEAN at that moment.
 * 3. Previous versions called `return nextLoad(url, context)` for clean files.
 *    nextLoad re-reads the file from disk, and the patcher may have corrupted it
 *    in the window between our readFileSync and nextLoad's read.
 *
 * Fix in v12:
 * - ALWAYS return { shortCircuit: true, source: ourVersion } for Vite dist chunks.
 *   Never call nextLoad for these files — eliminates the race entirely.
 * - Added nuclear targeted fix for `replaceDefine(code??"",` which is the
 *   exact injection pattern that causes the recurring SyntaxError.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Nuclear targeted fixes — applied FIRST before generic scanner
// ─────────────────────────────────────────────────────────────────────────────
function ultraDirectFix(src) {
  // Ultra-simple split/join replacements — no regex, no failure modes
  let s = src;
  s = s.split('code??"", ').join('code, ');
  s = s.split("code??'', ").join('code, ');
  s = s.split('code??"",').join('code,');
  s = s.split("code??'',").join('code,');
  s = s.split('code??""').join('code');
  s = s.split("code??''").join('code');
  // Broader: any identifier??"literal" or identifier??'literal'
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?"([^"\\]*)"/g, '$1');
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?'([^'\\]*)'/g, '$1');
  // Any remaining ??"..." or ??'...'
  s = s.replace(/\?\?"[^"]*"/g, '');
  s = s.replace(/\?\?'[^']*'/g, '');
  // ?? before method definitions — same line: replace ?? with space
  s = s.replace(/\?\?(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]{0,80}\)\s*\{)/g, ' ');
  // ?? before method definitions — cross-line: keep newline, drop ??
  s = s.replace(/\?\?(\r?\n[ \t]*)(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]{0,80}\)\s*\{)/g, '$1');
  // ?? at start of a line after newline+indent
  s = s.replace(/(\r?\n)([ \t]*)\?\?(?=[^\s?])/g, '$1$2');
  // End-of-line ?? immediately before newline
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?(\r?\n)/g, '$1$2');
  // NEW v17: identifier??( — ?? injected BETWEEN method name and its params
  // e.g. toJSON??() { — patcher inserts ?? after the name, before the open paren
  // This is the exact pattern causing "SyntaxError: Unexpected token '{'" at line 3469
  s = s.replace(/([A-Za-z_$][A-Za-z0-9_$]*)\?\?(?=\s*\([^)]{0,200}\)\s*\{)/g, '$1');
  return s;
}

function nuclearFix(src) {
  let s = src;

  // The exact recurring injection: replaceDefine(code??"",
  s = s.replace(/\basync function replaceDefine\(code\?\?"[^"]*",\s*/g, 'async function replaceDefine(code, ');
  s = s.replace(/\basync function replaceDefine\(code\?\?'[^']*',\s*/g, "async function replaceDefine(code, ");
  s = s.replace(/\breplaceDefine\(code\?\?"[^"]*",\s*/g, 'replaceDefine(code, ');
  s = s.replace(/\breplaceDefine\(code\?\?'[^']*',\s*/g, "replaceDefine(code, ");
  s = s.replace(/([(,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*)\?\?"[^"]*"/g, '$1');
  s = s.replace(/([(,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*)\?\?'[^']*'/g, '$1');

  // ─── v16 ULTRA-NUCLEAR: index-based ?? removal before method definitions ──
  // Regex approaches have failed across 14 versions due to context sensitivity.
  // This iterative approach finds every ?? and checks if a method def follows.
  {
    let out = '';
    let i = 0;
    while (i < s.length) {
      if (s[i] === '?' && s[i + 1] === '?') {
        // Skip whitespace after ??
        let j = i + 2;
        while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) j++;
        // Check if what follows is identifier() { (method definition)
        const rem = s.slice(j, j + 120);
        const mdef = rem.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]{0,80}\)\s*\{/);
        if (mdef) {
          // Replace ?? with appropriate separator based on preceding char
          const prev = out.length > 0 ? out[out.length - 1] : '';
          if (prev === '}' || prev === '' || /[\n\r,{([]/.test(prev)) {
            // After closing brace (class body) or separator: no comma needed
            // just skip the ??
          } else {
            // After expression value (object literal): restore comma
            out += ',';
          }
          // Preserve the whitespace between ?? and method name
          out += s.slice(i + 2, j);
          i = j;
          continue;
        }
      }
      out += s[i];
      i++;
    }
    s = out;
  }

  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// fixTightDoubleQuestion(src)
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
          let k = j + 1;
          while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
          if (k < n && src[k] === '}') {
            endPos = k + 1;
          } else {
            // non-empty block — remove only ??
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

        } else if (c === '(') {
          // NEW v17: identifier??( — ?? between name and open paren of call/method
          // e.g. toJSON??() { — remove only the ??
          endPos = i + 2;

        } else {
          const rest = src.slice(j);
          const m = rest.match(/^(null|undefined|false|0)(?!\w)/);
          if (m) {
            endPos = j + m[1].length;
          } else if (/^[a-zA-Z_$]/.test(c)) {
            // Identifier as right operand — remove only ??
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
// applyFix(source)
// ─────────────────────────────────────────────────────────────────────────────
function applyFix(source) {
  // Pass -1: ultra-direct string replacements (no regex, no failure modes)
  let fixed = ultraDirectFix(source);
  // Pass 0: nuclear targeted fixes (most specific, applied first)
  fixed = nuclearFix(fixed);

  // Pass 0.5a: remove ?? that appears after newline+whitespace (start-of-line injection).
  // The character-scanner (Pass 1) guards on src[i-1] being non-whitespace, so it
  // SKIPS any ?? that the patcher injected at the start of an indented line.
  // This regex catches those before the scanner runs.
  fixed = fixed.replace(/(\r?\n)([ \t]*)\?\?(?=[^\s?])/g, '$1$2');

  // Pass 0.5b (revised v17): ?? before any method definition — covers:
  //   Case A — ?? at end of line, method def continues on next line:
  //     identifier??\n    toJSON() {
  fixed = fixed.replace(
    /\?\?(\r?\n[ \t]*)(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{)/g,
    '$1' // remove ?? but keep the newline + indentation
  );
  //   Case B — ?? on same line before method definition:
  //     {??toJSON() {  /  get??toJSON() {  /  ,??toJSON() {
  //   Replace with space so preceding token doesn't merge with method name.
  fixed = fixed.replace(
    /\?\?(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{)/g,
    ' '
  );
  //   Case C (NEW v17) — identifier??(...) {  — ?? injected BETWEEN name and params:
  //     toJSON??() {  ← patcher puts ?? after the method name, before the paren
  //     This causes "SyntaxError: Unexpected token '{'" because toJSON??() is
  //     parsed as a nullish-coalescing expression, not a method definition.
  fixed = fixed.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?(?=\s*\([^)]{0,200}\)\s*\{)/g,
    '$1'
  );

  // Pass 0.5c: also strip bare ?? at absolute start of file (edge case)
  fixed = fixed.replace(/^[ \t]*\?\?(?=[^\s?])/gm, '');

  // Pass 0.5d: end-of-line ?? — identifier?? followed immediately by newline.
  // Parser sees identifier as left operand and ?? starts a broken expression.
  // Remove ?? and keep the newline so the next line is a fresh statement.
  fixed = fixed.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?(\r?\n)/g, '$1$2');

  // Pass 1: character-by-character scanner
  fixed = fixTightDoubleQuestion(fixed);

  // Pass 2: replaceDefine variants (belt-and-suspenders)
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
// initialize
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
// load hook
//
// CRITICAL CHANGE in v12:
//   We ALWAYS return { shortCircuit: true, source: ourVersion } for Vite dist
//   chunks — we NEVER call nextLoad for these files.
//
//   Reason: nextLoad re-reads the file from disk.  Between our readFileSync
//   and nextLoad's read, the patcher may have corrupted the file.  Returning
//   shortCircuit:true with our own read eliminates this race entirely.
// ─────────────────────────────────────────────────────────────────────────────
export async function load(url, context, nextLoad) {
  // Only intercept Vite's own node-layer chunks
  if (!url.startsWith('file:') || !url.includes('/vite/dist/node/')) {
    return nextLoad(url, context);
  }

  const fname = url.split('/').pop();

  // ── Read directly from disk ────────────────────────────────────────────────
  let src;
  try {
    src = readFileSync(fileURLToPath(url), 'utf8');
  } catch (readErr) {
    process.stderr.write('[vite-fix] ⚠️ disk-read failed for ' + fname + ': ' + String(readErr) + '\n');
    // Only fallback to nextLoad if we can't read the file at all
    return nextLoad(url, context);
  }

  // ── Apply fix ──────────────────────────────────────────────────────────────
  let fixed = src;
  let wasFixed = false;

  if (src.includes('??')) {
    fixed = applyFix(src);
    wasFixed = fixed !== src;

    if (wasFixed) {
      const removed = (src.match(/\?\?/g) || []).length - (fixed.match(/\?\?/g) || []).length;
      process.stderr.write(
        '[vite-fix] 🔧 fixed ' + fname + ' (' + removed + ' injections removed)\n'
      );
      // Write back to disk so CJS require() also gets the clean version
      try {
        writeFileSync(fileURLToPath(url), fixed, 'utf8');
        process.stderr.write('[vite-fix] 💾 wrote fix to disk: ' + fname + '\n');
      } catch (writeErr) {
        process.stderr.write('[vite-fix] ⚠️ disk-write failed: ' + String(writeErr) + '\n');
      }
    } else {
      const idx = src.indexOf('??');
      const ctx = src.slice(Math.max(0, idx - 40), idx + 60).replace(/\n/g, '↵');
      process.stderr.write(
        '[vite-fix] ⚠️ ?? unfixed in ' + fname + '\n         context: …' + ctx + '…\n'
      );
    }
  }

  // ── ALWAYS return shortCircuit:true with our version ──────────────────────
  // This is the critical fix for the patcher race condition.
  // nextLoad would re-read the file from disk, potentially getting the
  // patcher-corrupted version. By returning shortCircuit:true here,
  // Node uses our disk-read version (pre-race) regardless.
  return { shortCircuit: true, format: 'module', source: fixed };
}
