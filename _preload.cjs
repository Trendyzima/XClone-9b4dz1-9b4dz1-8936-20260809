'use strict';

/**
 * _preload.cjs v5
 *
 * Synchronous-only protection against Vite chunk injection.
 * NO setTimeout, NO setInterval, NO fs.watchFile — all of which
 * keep the event loop alive and cause Vercel builds to hang.
 *
 * Strategy:
 *  1. DISK PATCH  — fix dep-*.js files on disk immediately + chmod 444
 *  2. CJS HOOK    — Module.prototype._compile intercepts Vite CJS loads
 *
 * File watchers deliberately omitted: they prevent process exit.
 */

const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const CHUNKS_DIR = path.join(
  __dirname,
  'node_modules',
  'vite',
  'dist',
  'node',
  'chunks'
);

// ─── Core fix function ───────────────────────────────────────────────────────

function applyFix(s) {
  if (!s.includes('??')) return s;

  s = s.split('code??"", ').join('code, ');
  s = s.split("code??'', ").join('code, ');
  s = s.split('code??"",').join('code,');
  s = s.split("code??'',").join('code,');
  s = s.split('code??""').join('code');
  s = s.split("code??''").join('code');

  s = s.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?"([^"\\]*)"/g,
    '$1'
  );

  s = s.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?'([^'\\]*)'/g,
    '$1'
  );

  s = s.replace(/\?\?"[^"]*"/g, '');
  s = s.replace(/\?\?'[^']*'/g, '');

  s = s.replace(
    /\?\?(?=[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]{0,120}\)\s*\{)/g,
    ' '
  );

  s = s.replace(
    /\?\?(\r?\n[ \t]*)(?=[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]{0,120}\)\s*\{)/g,
    '$1'
  );

  s = s.replace(
    /(\r?\n)([ \t]*)\?\?(?=[^\s?])/g,
    '$1$2'
  );

  s = s.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?(\r?\n)/g,
    '$1$2'
  );

  s = s.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?(?=\s*\([^)]{0,200}\)\s*\{)/g,
    '$1'
  );

  return s;
}

// ─── Disk patch (synchronous, no watchers) ───────────────────────────────────

function patchFile(fpath) {
  let src;
  try {
    try { fs.chmodSync(fpath, 0o644); } catch (_) {}
    src = fs.readFileSync(fpath, 'utf8');
  } catch (_) {
    return false;
  }

  const lock = () => {
    try { fs.chmodSync(fpath, 0o444); } catch (_) {}
  };

  if (!src.includes('??')) {
    lock();
    return false;
  }

  const fixed = applyFix(src);

  if (fixed === src) {
    lock();
    return false;
  }

  try {
    fs.writeFileSync(fpath, fixed, 'utf8');
    lock();
    process.stderr.write(
      '[preload-fix] ✅ patched and verified ' +
      path.basename(fpath) +
      '\n'
    );
    return true;
  } catch (e) {
    lock();
    process.stderr.write(
      '[preload-fix] ⚠️ write failed ' +
      path.basename(fpath) + ': ' + e.message + '\n'
    );
    return false;
  }
}

function patchAll(label) {
  if (!fs.existsSync(CHUNKS_DIR)) return;
  let files;
  try {
    files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js'));
  } catch (_) {
    return;
  }
  let count = 0;
  files.forEach(f => {
    if (patchFile(path.join(CHUNKS_DIR, f))) count++;
  });
  if (count > 0) {
    process.stderr.write(
      '[preload-fix] 💾 patchAll(' + label + ') fixed ' + count + ' file(s)\n'
    );
  }
}

// ─── STEP 1: Patch existing chunks immediately (synchronous) ─────────────────
patchAll('startup');

// ─── STEP 2: Module._compile CJS fallback ────────────────────────────────────
const _origCompile = Module.prototype._compile;

Module.prototype._compile = function _compileFix(content, filename) {
  if (
    filename &&
    filename.includes('/vite/dist/node/') &&
    content.includes('??')
  ) {
    const fixed = applyFix(content);
    if (fixed !== content) {
      process.stderr.write(
        '[preload-fix] 🔧 _compile fixed ' +
        path.basename(filename) +
        '\n'
      );
      return _origCompile.call(this, fixed, filename);
    }
  }
  return _origCompile.call(this, content, filename);
};

process.stderr.write(
  '[preload-fix] ✅ preload v5 installed (disk-patch + CJS hook)\n'
);
