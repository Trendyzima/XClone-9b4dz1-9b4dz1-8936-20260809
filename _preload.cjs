/**
 * _preload.cjs  v2
 *
 * Loaded via NODE_OPTIONS=--require ./_preload.cjs BEFORE any other module.
 *
 * v2 critical additions:
 *  1. directFix now handles ??methodName() { patterns (not just ??string).
 *  2. Registers the ESM hook (vite-fix-loader.mjs) HERE, at the EARLIEST
 *     possible moment — before Node even begins loading Vite's entry point.
 *     Previously the ESM hook was only registered in vite.config.cjs, which
 *     loads AFTER dep-C6uTJdX2.js is already imported (too late).
 */

'use strict';
const fs     = require('fs');
const path   = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

const __dir      = __dirname;
const CHUNKS_DIR = path.join(__dir, 'node_modules', 'vite', 'dist', 'node', 'chunks');

// ─── directFix ────────────────────────────────────────────────────────────────
// Handles every known injection form without regex complexity.
function directFix(src) {
  let s = src;

  // 1. code??""  /  code??'' — the replaceDefine parameter injection
  s = s.split('code??"", ').join('code, ');
  s = s.split("code??'', ").join('code, ');
  s = s.split('code??"",').join('code,');
  s = s.split("code??'',").join('code,');
  s = s.split('code??""').join('code');
  s = s.split("code??''").join('code');

  // 2. identifier??string-literal  (broader catch-all)
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?"([^"\\]*)"/g, '$1');
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?'([^'\\]*)'/g, '$1');

  // 3. Any remaining ??string / ??'' that weren't preceded by an identifier
  s = s.replace(/\?\?"[^"]*"/g, '');
  s = s.replace(/\?\?'[^']*'/g, '');

  // 4. ??methodName() {  on the SAME line  →  space + methodName() {
  //    (replace ?? with a space so preceding token doesn't merge with method name)
  s = s.replace(/\?\?(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]{0,80}\)\s*\{)/g, ' ');

  // 5. ??\n   methodName() {  (cross-line injection)  →  keep newline, drop ??
  s = s.replace(/\?\?(\r?\n[ \t]*)(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]{0,80}\)\s*\{)/g, '$1');

  // 6. ?? appearing at the start of a line after newline + optional indent
  s = s.replace(/(\r?\n)([ \t]*)\?\?(?=[^\s?])/g, '$1$2');

  // 7. End-of-line ??  — identifier?? followed immediately by newline
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?(\r?\n)/g, '$1$2');

  return s;
}

// ─── patchFile ────────────────────────────────────────────────────────────────
function patchFile(fpath) {
  let src;
  try {
    try { fs.chmodSync(fpath, 0o644); } catch (_) {}
    src = fs.readFileSync(fpath, 'utf8');
  } catch (_) { return false; }

  if (!src.includes('??')) return false;

  const fixed = directFix(src);
  if (fixed === src) return false;

  try {
    fs.writeFileSync(fpath, fixed, 'utf8');
    try { fs.chmodSync(fpath, 0o444); } catch (_) {}
    process.stderr.write('[preload-fix] ✅ patched ' + path.basename(fpath) + '\n');
    return true;
  } catch (e) {
    process.stderr.write('[preload-fix] ⚠️  write failed ' + path.basename(fpath) + ': ' + e.message + '\n');
    return false;
  }
}

// ─── patchAll ────────────────────────────────────────────────────────────────
function patchAll(label) {
  if (!fs.existsSync(CHUNKS_DIR)) return;
  let files;
  try { files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js')); }
  catch (_) { return; }
  let count = 0;
  files.forEach(f => { if (patchFile(path.join(CHUNKS_DIR, f))) count++; });
  if (count > 0) process.stderr.write('[preload-fix] 💾 patchAll(' + label + ') fixed ' + count + ' file(s)\n');
}

// ─── STEP 1: Patch existing files on disk immediately ────────────────────────
patchAll('startup');

// ─── STEP 2: Register the ESM load hook as early as possible ─────────────────
// This is the CRITICAL v2 addition. Previously the ESM hook was registered
// inside vite.config.cjs (which loads after dep-C6uTJdX2.js is already
// imported). By registering it here — from --require, the absolute earliest
// Node.js hook point — the hook is active before any Vite modules load.
(function registerEsmHookEarly() {
  if (typeof Module.register !== 'function') {
    process.stderr.write('[preload-fix] ℹ️  module.register not available (Node < 20.6) — ESM hook skipped\n');
    return;
  }
  const hookFile = path.join(__dir, 'vite-fix-loader.mjs');
  if (!fs.existsSync(hookFile)) {
    process.stderr.write('[preload-fix] ⚠️  vite-fix-loader.mjs not found — ESM hook skipped\n');
    return;
  }
  try {
    Module.register(
      pathToFileURL(hookFile).href,
      pathToFileURL(path.join(__dir, '_preload.cjs')).href,
      { data: {} }
    );
    process.stderr.write('[preload-fix] ✅ ESM hook registered EARLY (from --require preload)\n');
  } catch (e) {
    process.stderr.write('[preload-fix] ⚠️  ESM hook registration failed: ' + e.message + '\n');
  }
})();

// ─── STEP 3: Module._compile hook — catches any CJS require() after startup ──
const _origCompile = Module.prototype._compile;
Module.prototype._compile = function _compileFix(content, filename) {
  if (filename && filename.includes('/vite/dist/node/') && content.includes('??')) {
    const fixed = directFix(content);
    if (fixed !== content) {
      process.stderr.write('[preload-fix] 🔧 _compile fixed ' + path.basename(filename) + '\n');
      return _origCompile.call(this, fixed, filename);
    }
  }
  return _origCompile.call(this, content, filename);
};

// ─── STEP 4: fs.watch + polling for patcher re-injection ─────────────────────
// The patcher may corrupt files AFTER we patched them. Watch for changes and
// re-patch immediately.
(function watchChunks() {
  if (!fs.existsSync(CHUNKS_DIR)) return;
  let files;
  try { files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js')); }
  catch (_) { return; }
  files.forEach(f => {
    const fpath = path.join(CHUNKS_DIR, f);
    try {
      const w = fs.watch(fpath, { persistent: false }, (evt) => {
        if (evt === 'change') patchFile(fpath);
      });
      w.on('error', () => {});
    } catch (_) {}
    fs.watchFile(fpath, { persistent: false, interval: 100 }, () => patchFile(fpath));
  });
})();

process.stderr.write('[preload-fix] ✅ preload hook installed (v2 — ESM hook registered early)\n');
