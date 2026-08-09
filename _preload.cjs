/**
 * _preload.cjs  v4
 *
 * Three layers of protection against the OnSpace Vite chunk patcher:
 *
 *  1. DISK PATCH   — fix dep-*.js files on disk at startup + chmod 444.
 *  2. ESM HOOK     — Module.register(vite-fix-loader.mjs). In Node 20.6+,
 *                    module.register() from a CJS --require preload is
 *                    SYNCHRONOUS (uses Atomics.wait) so the hook is active
 *                    before Vite's first ESM import.
 *                    For Vercel, _build.cjs also passes --experimental-loader
 *                    as a belt-and-suspenders guarantee.
 *  3. CJS HOOK     — Module.prototype._compile intercepts any CJS require.
 */

'use strict';
const fs     = require('fs');
const path   = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

const CHUNKS_DIR = path.join(__dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks');

// ─── Core fix function (shared by all hooks) ─────────────────────────────────
function applyFix(s) {
  if (!s.includes('??')) return s;

  // 1. The most common form: code??"",  or  code?? '',
  s = s.split('code??"", ').join('code, ');
  s = s.split("code??'', ").join('code, ');
  s = s.split('code??"",').join('code,');
  s = s.split("code??'',").join('code,');
  s = s.split('code??""').join('code');
  s = s.split("code??''").join('code');

  // 2. Any  identifier??string  (quoted strings)
  s = s.replace(/([A-Za-z_$][A-Za-z0-9_$]*)\?\?"([^"\\]*)"/g, '$1');
  s = s.replace(/([A-Za-z_$][A-Za-z0-9_$]*)\?\?'([^'\\]*)'/g, '$1');

  // 3. Bare ??string  (no preceding identifier)
  s = s.replace(/\?\?"[^"]*"/g, '');
  s = s.replace(/\?\?'[^']*'/g, '');

  // 4. ??methodName(…) {   — same line
  s = s.replace(/\?\?(?=[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]{0,120}\)\s*\{)/g, ' ');

  // 5. ??\n  methodName(…) {  — cross-line
  s = s.replace(/\?\?(\r?\n[ \t]*)(?=[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]{0,120}\)\s*\{)/g, '$1');

  // 6. ?? at the start of a line
  s = s.replace(/(\r?\n)([ \t]*)\?\?(?=[^\s?])/g, '$1$2');

  // 7. identifier?? at end of line
  s = s.replace(/([A-Za-z_$][A-Za-z0-9_$]*)\?\?(\r?\n)/g, '$1$2');

  return s;
}

// ─── Disk patch + lock ───────────────────────────────────────────────────────
function patchFile(fpath) {
  let src;
  try {
    try { fs.chmodSync(fpath, 0o644); } catch (_) {}
    src = fs.readFileSync(fpath, 'utf8');
  } catch (_) { return false; }

  // ALWAYS re-lock, whether or not we patched (prevents patcher re-injection
  // in the tiny window where the file is temporarily readable).
  const lock = () => { try { fs.chmodSync(fpath, 0o444); } catch (_) {} };

  if (!src.includes('??')) { lock(); return false; }

  const fixed = applyFix(src);
  if (fixed === src) { lock(); return false; }

  try {
    fs.writeFileSync(fpath, fixed, 'utf8');
    lock();
    process.stderr.write('[preload-fix] ✅ patched ' + path.basename(fpath) + '\n');
    return true;
  } catch (e) {
    lock();
    process.stderr.write('[preload-fix] ⚠️  write failed ' + path.basename(fpath) + ': ' + e.message + '\n');
    return false;
  }
}

function patchAll(label) {
  if (!fs.existsSync(CHUNKS_DIR)) return;
  let files;
  try { files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js')); }
  catch (_) { return; }
  let count = 0;
  files.forEach(f => { if (patchFile(path.join(CHUNKS_DIR, f))) count++; });
  if (count > 0)
    process.stderr.write('[preload-fix] 💾 patchAll(' + label + ') fixed ' + count + ' file(s)\n');
}

// ─── STEP 1: Patch existing chunks immediately ───────────────────────────────
patchAll('startup');

// ─── STEP 2: ESM hook via Module.register() with SAB synchronization ───────────
// Module.register() is inherently async — the hook worker may not be ready
// before Vite fires its first dynamic ESM import.  We pass a SharedArrayBuffer;
// initialize() in vite-fix-loader.mjs calls Atomics.notify, and we block here
// via Atomics.wait (allowed on Node.js main thread) until ready.
//
// IMPORTANT: Skip entirely when chunks dir does not exist (e.g. during npm
// postinstall scripts for @swc/core, esbuild, etc. — vite isn't installed yet
// so there's nothing to hook).  Without this guard, Atomics.wait would block
// the postinstall for 5 s before timing out.
(function registerEsmHook() {
  if (typeof Module.register !== 'function') return; // Node < 20.6
  // Guard: if vite chunks don't exist, we're in postinstall context — skip.
  if (!fs.existsSync(CHUNKS_DIR)) {
    process.stderr.write('[preload-fix] ℹ️  chunks dir absent — ESM hook skipped (postinstall context)\n');
    return;
  }
  // Guard: if CWD is inside node_modules, we're running as a dependency's
  // postinstall script — skip ESM hook to avoid blocking for 5 s.
  if (process.cwd().includes('/node_modules/') || process.cwd().includes('\\node_modules\\')) {
    process.stderr.write('[preload-fix] ℹ️  postinstall CWD detected — ESM hook skipped\n');
    return;
  }
  const loaderPath = path.join(__dirname, 'vite-fix-loader.mjs');
  if (!fs.existsSync(loaderPath)) {
    process.stderr.write('[preload-fix] ⚠️  vite-fix-loader.mjs not found — ESM hook skipped\n');
    return;
  }
  try {
    const sab = new SharedArrayBuffer(4);
    const signal = new Int32Array(sab);
    Atomics.store(signal, 0, 0);

    Module.register(
      pathToFileURL(loaderPath).href,
      pathToFileURL(__filename).href,
      { data: { sab } }
    );

    // Block until hook thread signals ready (max 5 s)
    const waitResult = Atomics.wait(signal, 0, 0, 5000);
    if (waitResult !== 'timed-out') {
      process.stderr.write('[preload-fix] ✅ ESM hook ready (SAB sync, result=' + waitResult + ')\n');
    } else {
      process.stderr.write('[preload-fix] ⚠️  ESM hook SAB timed out — hook may not be active\n');
    }
  } catch (e) {
    process.stderr.write('[preload-fix] ⚠️  Module.register failed: ' + e.message + '\n');
  }
})();

// ─── STEP 3: Module._compile hook (CJS fallback) ────────────────────────────
const _origCompile = Module.prototype._compile;
Module.prototype._compile = function _compileFix(content, filename) {
  if (filename && filename.includes('/vite/dist/node/') && content.includes('??')) {
    const fixed = applyFix(content);
    if (fixed !== content) {
      process.stderr.write('[preload-fix] 🔧 _compile fixed ' + path.basename(filename) + '\n');
      return _origCompile.call(this, fixed, filename);
    }
  }
  return _origCompile.call(this, content, filename);
};

// ─── STEP 4: fs.watch — catch patcher re-injection after startup ─────────────
(function watchChunks() {
  if (!fs.existsSync(CHUNKS_DIR)) return;
  let files;
  try { files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js')); }
  catch (_) { return; }
  files.forEach(f => {
    const fp = path.join(CHUNKS_DIR, f);
    try {
      const w = fs.watch(fp, { persistent: false }, (evt) => {
        if (evt === 'change') patchFile(fp);
      });
      w.on('error', () => {});
    } catch (_) {}
    // Polling as belt-and-suspenders
    fs.watchFile(fp, { persistent: false, interval: 100 }, () => patchFile(fp));
  });
})();

process.stderr.write('[preload-fix] ✅ preload v4 installed (disk-patch + ESM hook + CJS hook + watcher)\n');
