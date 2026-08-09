/**
 * _preload.cjs  v4
 *
 * Two layers of protection against the OnSpace Vite chunk patcher:
 *
 *  1. DISK PATCH   — fix dep-*.js files on disk at startup + chmod 444.
 *  2. CJS HOOK     — Module.prototype._compile intercepts any CJS require.
 *
 * The ESM hook is handled separately:
 *  - Vercel builds: --experimental-loader vite-fix-loader.mjs (synchronous,
 *    guaranteed active before any ESM load, set by _build.cjs)
 *  - OnSpace preview: vite.config.cjs registers it via Module.register()
 *
 * NOTE: Module.register() is NOT called here because it is asynchronous
 * (sends a message to the ESM loader worker thread) and may not complete
 * before Vite's first ESM import, making it unreliable as a --require hook.
 */

'use strict';
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

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

// ─── STEP 2: Module._compile hook (CJS fallback) ────────────────────────────
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

// ─── STEP 3: fs.watch — catch patcher re-injection after startup ─────────────
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

process.stderr.write('[preload-fix] ✅ preload v4 installed (disk-patch + CJS hook + watcher)\n');
