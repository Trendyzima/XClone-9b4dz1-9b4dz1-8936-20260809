const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy A — ESM module load hook  (v6: only intercept corrupted files)
//
// Registers vite-fix-loader.mjs as an ES module load hook.
// Synchronisation is attempted via SharedArrayBuffer + Atomics.wait so the hook
// worker is guaranteed to be alive before Vite loads its chunks.
// If SharedArrayBuffer is unavailable (some container environments disable it)
// we fall back to a 200 ms spin-wait which is sufficient on any build machine.
// ═══════════════════════════════════════════════════════════════════════════════
(function registerEsmHook() {
  try {
    const nodeModule = require('module');
    if (typeof nodeModule.register !== 'function') {
      process.stderr.write('[vite-patch] ℹ️  module.register not available (Node < 20.6)\n');
      return;
    }

    const hookFile = path.join(__dirname, 'vite-fix-loader.mjs');
    if (!fs.existsSync(hookFile)) {
      process.stderr.write('[vite-patch] ⚠️  vite-fix-loader.mjs not found — skipping hook\n');
      return;
    }

    let sabData = {};
    let usedAtomics = false;

    try {
      if (typeof SharedArrayBuffer !== 'undefined') {
        const sab = new SharedArrayBuffer(4);
        const arr = new Int32Array(sab);
        Atomics.store(arr, 0, 0);
        sabData = { sab };
        usedAtomics = true;
      }
    } catch (_) {
      // SharedArrayBuffer unavailable — proceed without Atomics sync
    }

    nodeModule.register(
      pathToFileURL(hookFile).href,
      pathToFileURL(__filename).href,
      { data: sabData }
    );

    if (usedAtomics) {
      // Block until hook worker signals it is alive (≤ 2 000 ms)
      const arr = new Int32Array(sabData.sab);
      const result = Atomics.wait(arr, 0, 0, 2000);
      if (result === 'ok') {
        process.stderr.write('[vite-patch] ✅ ESM hook registered & synchronised\n');
      } else {
        process.stderr.write('[vite-patch] ⚠️  ESM hook Atomics.wait ' + result + ' — continuing\n');
      }
    } else {
      // Spin-wait ≈ 200 ms to let the hook worker thread initialise
      const t = Date.now();
      while (Date.now() - t < 200) { /* spin */ }
      process.stderr.write('[vite-patch] ✅ ESM hook registered (spin-wait fallback)\n');
    }
  } catch (e) {
    process.stderr.write('[vite-patch] ❌ ESM hook registration failed: ' + e.message + '\n');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy B — Disk-based fix + continuous file watcher
//
// Scans every .js file in Vite's chunks dir, removes the ?? corruption the
// OnSpace patcher injects, and writes the fix back.
//
// patchViteChunks() runs three times (pre-require, post-require, buildStart).
// watchViteChunks() sets up a fs.watchFile listener that immediately re-fixes
// any file the patcher modifies after our lock — this handles the case where
// the patcher runs as root and bypasses chmod.
//
// NOTE: We no longer use chmod 444 because it prevented our own re-fix writes
//       when the patcher ran with elevated privileges (write fails silently,
//       leaving the corruption in place).
// ═══════════════════════════════════════════════════════════════════════════════

const CORRUPT_RE = /\b(\w+(?:\([^)]*\))*)\?\?["'][^"']*["']/g;

function fixSource(src) {
  let fixed = src.replace(CORRUPT_RE, '$1');
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');
  return fixed;
}

const watchedFiles = new Set();

function patchViteChunks() {
  const chunksDir = path.join(
    __dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks'
  );

  if (!fs.existsSync(chunksDir)) return;

  let files;
  try {
    files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js'));
  } catch (e) {
    process.stderr.write('[vite-patch] readdir error: ' + e.message + '\n');
    return;
  }

  for (const fname of files) {
    const fpath = path.join(chunksDir, fname);

    // Ensure writable so we can overwrite if needed
    try { fs.chmodSync(fpath, 0o644); } catch (_) {}

    let src;
    try { src = fs.readFileSync(fpath, 'utf8'); } catch (e) {
      process.stderr.write('[vite-patch] read error ' + fname + ': ' + e.message + '\n');
      continue;
    }

    if (!src.includes('??')) continue;  // nothing to fix

    const fixed = fixSource(src);
    if (fixed === src) continue;        // ?? present but regex didn't match — legit code

    try {
      fs.writeFileSync(fpath, fixed, 'utf8');
      process.stderr.write('[vite-patch] 💾 disk-fixed ' + fname + '\n');
    } catch (e) {
      process.stderr.write('[vite-patch] write error ' + fname + ': ' + e.message + '\n');
    }
  }
}

function watchViteChunks() {
  const chunksDir = path.join(
    __dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks'
  );
  if (!fs.existsSync(chunksDir)) return;

  let files;
  try { files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js')); }
  catch (_) { return; }

  for (const fname of files) {
    const fpath = path.join(chunksDir, fname);
    if (watchedFiles.has(fpath)) continue;
    watchedFiles.add(fpath);

    fs.watchFile(fpath, { persistent: false, interval: 150 }, () => {
      try {
        const src = fs.readFileSync(fpath, 'utf8');
        if (!src.includes('??')) return;
        const fixed = fixSource(src);
        if (fixed === src) return;
        try { fs.chmodSync(fpath, 0o644); } catch (_) {}
        fs.writeFileSync(fpath, fixed, 'utf8');
        process.stderr.write('[vite-patch] 👁 watcher re-fixed ' + fname + '\n');
      } catch (_) {}
    });
  }
}

// ── Run fixes ────────────────────────────────────────────────────────────────

// Pass 1: before requiring Vite
patchViteChunks();
// Start continuous watcher so patcher re-corruptions are caught between passes
watchViteChunks();

// ─────────────────────────────────────────────────────────────────────────────
const { defineConfig } = require('vite');
// ─────────────────────────────────────────────────────────────────────────────

// Pass 2: immediately after Vite is loaded (catches any re-corruption)
patchViteChunks();

const stub = path.resolve(__dirname, 'src/lib/capacitor-stub.ts');

module.exports = defineConfig({
  server: {
    host: '::',
    port: 8080,
  },

  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },

  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@capacitor/core':                         stub,
      '@capacitor/status-bar':                   stub,
      '@capacitor/app':                          stub,
      '@capacitor/device':                       stub,
      '@capacitor/filesystem':                   stub,
      '@capacitor/network':                      stub,
      '@capacitor/push-notifications':           stub,
      '@capacitor/share':                        stub,
      '@capacitor-community/admob':              stub,
      '@capacitor-community/firebase-analytics': stub,
      '@capacitor-community/media':              stub,
      '@capgo/capacitor-updater':                stub,
      '@vercel/analytics/react':                 stub,
    },
  },

  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      plugins: [
        // ── Strategy C: buildStart re-patch ──────────────────────────────
        {
          name: 'vite-chunk-repatch',
          buildStart() {
            // Pass 3: right before rollup transform begins
            patchViteChunks();
          },
        },

        // ── Strategy D: Rollup ESM/CJS interop fix ───────────────────────
        {
          name: 'fix-esm-cjs-react-interop',
          transform(code, id) {
            const inNodeModules = id.includes('node_modules');
            const isNodeMjs    = inNodeModules && id.endsWith('.mjs');
            const isNodeEsmJs  = inNodeModules && id.endsWith('.js') &&
                                  (/\/esm\//.test(id) || /\/dist\/esm/.test(id) || /\/es\//.test(id));
            const isSourceFile = !inNodeModules && /\.(tsx?|jsx?)$/.test(id);
            if (!isNodeMjs && !isNodeEsmJs && !isSourceFile) return null;

            let modified = code;
            let changed   = false;
            let counter   = 0;

            // Fix 1: default import from 'react'
            const defaultRe = /import ([A-Za-z_$][A-Za-z0-9_$]*) from ['"]react['"]\s*;?/g;
            if (defaultRe.test(modified)) {
              defaultRe.lastIndex = 0;
              modified = modified.replace(
                defaultRe,
                (_, name) => 'import * as ' + name + " from 'react';"
              );
              changed = true;
            }

            // Fix 2: named imports from CJS React sub-packages
            const CJS_PKGS = [
              'react',
              'react/jsx-runtime',
              'react/jsx-dev-runtime',
              'react-dom',
            ];

            for (const pkg of CJS_PKGS) {
              const escapedPkg = pkg.replace(/\//g, '\\/');
              const namedRe = new RegExp(
                'import\\s+\\{([^}]+)\\}\\s+from\\s+[\'"]+' + escapedPkg + '[\'"]+\\s*;?',
                'g'
              );
              if (!new RegExp(namedRe.source).test(modified)) continue;
              namedRe.lastIndex = 0;

              modified = modified.replace(namedRe, function(_, specifiers) {
                var varName = '_ci' + (counter++);
                var destructured = specifiers.split(',').map(function(s) {
                  var t = s.trim();
                  var parts = t.split(/\s+as\s+/);
                  return parts.length === 2
                    ? parts[0].trim() + ': ' + parts[1].trim()
                    : t;
                }).join(', ');
                return 'import * as ' + varName + " from '" + pkg + "'; const { " + destructured + ' } = ' + varName + ';';
              });
              changed = true;
            }

            return changed ? { code: modified, map: null } : null;
          },
        },
      ],
      output: {
        interop: 'auto',
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.code === 'MISSING_EXPORT') return;
        warn(warning);
      },
    },
  },
});
