'use strict';

/**
 * _preload.cjs v4
 *
 * Protection against the OnSpace Vite chunk patcher:
 *
 *  1. DISK PATCH
 *     Fix dep-*.js files on disk at startup + chmod 444.
 *
 *  2. CJS HOOK
 *     Module.prototype._compile intercepts Vite CJS modules.
 *
 *  3. FILE WATCHERS
 *     Catch patcher re-injection after startup.
 *
 * NOTE:
 * ESM protection is handled by _build.cjs through:
 *
 *   --experimental-loader vite-fix-loader.mjs
 *
 * This file intentionally does NOT use Module.register() or Atomics.wait().
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

  // 2. Any identifier??string (quoted strings)
  s = s.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?"([^"\\]*)"/g,
    '$1'
  );

  s = s.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?'([^'\\]*)'/g,
    '$1'
  );

  // 3. Bare ??string (no preceding identifier)
  s = s.replace(/\?\?"[^"]*"/g, '');
  s = s.replace(/\?\?'[^']*'/g, '');

  // 4. ??methodName(...) { — same line
  s = s.replace(
    /\?\?(?=[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]{0,120}\)\s*\{)/g,
    ' '
  );

  // 5. ??\n methodName(...) { — cross-line
  s = s.replace(
    /\?\?(\r?\n[ \t]*)(?=[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]{0,120}\)\s*\{)/g,
    '$1'
  );

  // 6. ?? at the start of a line
  s = s.replace(
    /(\r?\n)([ \t]*)\?\?(?=[^\s?])/g,
    '$1$2'
  );

  // 7. identifier?? at end of line
  s = s.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?(\r?\n)/g,
    '$1$2'
  );

  // 8. identifier?? — injected BETWEEN method name and its parens
  //    e.g. toJSON??() { → toJSON() {
  s = s.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?(?=\s*\([^)]{0,200}\)\s*\{)/g,
    '$1'
  );

  return s;
}

// ─── Malformed syntax verification ──────────────────────────────────────────

function hasMalformedSyntax(s) {
  return /[A-Za-z_$][A-Za-z0-9_$]*\?\?\s*\([^)]{0,200}\)\s*\{/.test(s);
}

// ─── Disk patch + lock ───────────────────────────────────────────────────────

function patchFile(fpath) {
  let src;

  try {
    try {
      fs.chmodSync(fpath, 0o644);
    } catch (_) {}

    src = fs.readFileSync(fpath, 'utf8');
  } catch (_) {
    return false;
  }

  // ALWAYS re-lock after checking/patching.
  const lock = () => {
    try {
      fs.chmodSync(fpath, 0o444);
    } catch (_) {}
  };

  if (!src.includes('??')) {
    lock();
    return false;
  }

  const hadMalformed = hasMalformedSyntax(src);
  const fixed = applyFix(src);

  // Nothing changed.
  if (fixed === src) {
    if (hadMalformed) {
      process.stderr.write(
        '[preload-fix] ❌ malformed syntax detected but not repaired: ' +
        path.basename(fpath) +
        '\n'
      );
    }

    lock();
    return false;
  }

  // Verify known malformed syntax is gone.
  if (hasMalformedSyntax(fixed)) {
    process.stderr.write(
      '[preload-fix] ⚠️ repair incomplete: ' +
      path.basename(fpath) +
      '\n'
    );

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
      path.basename(fpath) +
      ': ' +
      e.message +
      '\n'
    );

    return false;
  }
}

// ─── Patch all Vite chunks ───────────────────────────────────────────────────

function patchAll(label) {
  if (!fs.existsSync(CHUNKS_DIR)) return;

  let files;

  try {
    files = fs
      .readdirSync(CHUNKS_DIR)
      .filter(f => f.endsWith('.js'));
  } catch (_) {
    return;
  }

  let count = 0;

  files.forEach(f => {
    if (patchFile(path.join(CHUNKS_DIR, f))) {
      count++;
    }
  });

  if (count > 0) {
    process.stderr.write(
      '[preload-fix] 💾 patchAll(' +
      label +
      ') fixed ' +
      count +
      ' file(s)\n'
    );
  }
}

// ─── STEP 1: Patch existing chunks immediately ───────────────────────────────

patchAll('startup');

// ─── STEP 2: Short re-injection protection ───────────────────────────────────
//
// OnSpace may re-inject malformed syntax shortly after startup.
// Keep the protection window short so it does not unnecessarily interfere
// with the Vite build.

(function repeatedPatch() {
  const MAX_PASSES = 5;
  const INTERVAL_MS = 100;

  let pass = 0;

  function runPass() {
    pass++;

    patchAll('pass-' + pass);

    if (pass < MAX_PASSES) {
      setTimeout(runPass, INTERVAL_MS);
    } else {
      process.stderr.write(
        '[preload-fix] ✅ repeated patch cycle complete (' +
        MAX_PASSES +
        ' passes)\n'
      );
    }
  }

  runPass();
})();

// ─── STEP 3: Module._compile CJS fallback ────────────────────────────────────

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

      return _origCompile.call(
        this,
        fixed,
        filename
      );
    }
  }

  return _origCompile.call(
    this,
    content,
    filename
  );
};

// ─── STEP 4: fs.watch + polling ──────────────────────────────────────────────

(function watchChunks() {
  if (!fs.existsSync(CHUNKS_DIR)) return;

  let files;

  try {
    files = fs
      .readdirSync(CHUNKS_DIR)
      .filter(f => f.endsWith('.js'));
  } catch (_) {
    return;
  }

  files.forEach(f => {
    const fp = path.join(CHUNKS_DIR, f);

    // Native filesystem watcher.
    try {
      const watcher = fs.watch(
        fp,
        { persistent: false },
        (evt) => {
          if (evt === 'change') {
            patchFile(fp);
          }
        }
      );

      watcher.on('error', () => {});
    } catch (_) {}

    // Polling fallback.
    try {
      fs.watchFile(
        fp,
        {
          persistent: false,
          interval: 100
        },
        () => {
          patchFile(fp);
        }
      );
    } catch (_) {}
  });
})();

process.stderr.write(
  '[preload-fix] ✅ preload v4 installed ' +
  '(disk-patch + CJS hook + watcher)\n'
);
