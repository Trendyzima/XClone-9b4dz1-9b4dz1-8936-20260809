'use strict';

/**
 * _preload.cjs v7
 *
 * Minimal CJS hook — the disk patch is now handled by the installCommand
 * in vercel.json BEFORE the build starts, so this file only needs to catch
 * any remaining in-memory CJS loads (belt-and-suspenders).
 *
 * NO setTimeout, NO setInterval, NO fs.watchFile, NO Atomics.wait.
 * NO broad `??` regex — only the exact broken `code??""` / `code??''` patterns.
 */

const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const CHUNKS_DIR = path.join(
  __dirname,
  'node_modules', 'vite', 'dist', 'node', 'chunks'
);

/** Surgical fix — only the known bad patterns, nothing else */
function applyFix(s) {
  if (!s.includes('code??')) return s;
  let o = s;
  // comma follows
  o = o.split('code??"", ').join('code, ');
  o = o.split("code??'', ").join('code, ');
  o = o.split('code??"",').join('code,');
  o = o.split("code??'',").join('code,');
  // no comma — trailing position
  o = o.split('code??""').join('code');
  o = o.split("code??''").join('code');
  return o;
}

/** Synchronous disk patch (run once at startup) */
function patchAll() {
  if (!fs.existsSync(CHUNKS_DIR)) return;
  let files;
  try { files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js')); }
  catch (_) { return; }

  let fixed = 0;
  for (const f of files) {
    const fp = path.join(CHUNKS_DIR, f);
    try {
      try { fs.chmodSync(fp, 0o644); } catch (_) {}
      const src = fs.readFileSync(fp, 'utf8');
      if (!src.includes('code??')) { try { fs.chmodSync(fp, 0o444); } catch (_) {} continue; }
      const out = applyFix(src);
      if (out === src) { try { fs.chmodSync(fp, 0o444); } catch (_) {} continue; }
      fs.writeFileSync(fp, out, 'utf8');
      try { fs.chmodSync(fp, 0o444); } catch (_) {}
      process.stderr.write('[preload-fix] ✅ patched ' + f + '\n');
      fixed++;
    } catch (e) {
      process.stderr.write('[preload-fix] ⚠️ ' + f + ': ' + e.message + '\n');
    }
  }
  if (fixed) process.stderr.write('[preload-fix] 💾 patchAll fixed ' + fixed + ' file(s)\n');
}

patchAll();

/** CJS compile hook — catches any remaining runtime loads */
const _orig = Module.prototype._compile;
Module.prototype._compile = function(content, filename) {
  if (filename && filename.includes('/vite/dist/node/') && content.includes('code??')) {
    const fixed = applyFix(content);
    if (fixed !== content) {
      process.stderr.write('[preload-fix] 🔧 _compile patched ' + path.basename(filename) + '\n');
      return _orig.call(this, fixed, filename);
    }
  }
  return _orig.call(this, content, filename);
};

process.stderr.write('[preload-fix] ✅ preload v7 installed\n');
