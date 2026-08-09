const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy A — ESM module load hook  (v8: nextLoad-based source augmentation)
//
// v8 key change: the hook now calls nextLoad() first to get the raw source
// text, then fixes it in memory before returning. This is the canonical
// Node.js pattern for augmenting module source and ensures we intercept
// even when the patcher re-corrupts between our disk-fix and Node's file-read.
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

    // Optional Atomics synchronisation so main thread waits until hook worker is up
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
    } catch (_) { /* SharedArrayBuffer unavailable */ }

    nodeModule.register(
      pathToFileURL(hookFile).href,
      pathToFileURL(__filename).href,
      { data: sabData }
    );

    if (usedAtomics) {
      const arr = new Int32Array(sabData.sab);
      const result = Atomics.wait(arr, 0, 0, 3000); // up to 3s
      if (result === 'ok') {
        process.stderr.write('[vite-patch] ✅ ESM hook registered & synchronised\n');
      } else {
        process.stderr.write('[vite-patch] ⚠️  ESM hook Atomics.wait ' + result + ' — continuing anyway\n');
      }
    } else {
      // Spin-wait fallback: gives the worker thread time to start
      const end = Date.now() + 300;
      while (Date.now() < end) { /* spin */ }
      process.stderr.write('[vite-patch] ✅ ESM hook registered (spin-wait fallback)\n');
    }
  } catch (e) {
    process.stderr.write('[vite-patch] ❌ ESM hook registration failed: ' + e.message + '\n');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy B — Disk-based fix + continuous file watchers
//
// Covers the window between hook registration and first module load,
// and catches any patcher re-corruption that happens after the hook fires.
//
// v8 changes:
//   - Uses fs.watch (OS-level inotify/kqueue, ~1ms latency) for each chunk
//     in addition to fs.watchFile (polling) for broader coverage.
//   - Runs patchViteChunks() more aggressively: before require, after require,
//     in buildStart, and every 200ms for the first 8 seconds of the build.
//   - CORRUPT_RE covers all patcher fallback types: ??"" ??{} ??[] ??null …
// ═══════════════════════════════════════════════════════════════════════════════

// Tight-match only (no spaces around ??) so legitimate nullish coalescing is untouched.
const CORRUPT_RE =
  /\b(\w+(?:\([^)]*\))*)\?\?(?:["'][^"']*["']|\{\s*\}|\[\s*\]|null\b|undefined\b|false\b|0\b)/g;

function fixSource(src) {
  // Primary regex pass — all patcher fallback types
  let fixed = src.replace(CORRUPT_RE, '$1');

  // Belt-and-suspenders: explicit splits for the replaceDefine family
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

  // Extra passes — object/array/null/undefined (belt-and-suspenders)
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?\{\s*\}/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?\[\s*\]/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?null\b/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?undefined\b/g, '$1');
  fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\?\?false\b/g, '$1');

  return fixed;
}

// Tracks paths already being watched (avoid duplicate watchers)
const fsWatchers  = new Map(); // path → fs.FSWatcher
const pollWatched = new Set(); // path → already watched via watchFile

function applyFixToDisk(fpath, label) {
  try { fs.chmodSync(fpath, 0o644); } catch (_) {}
  let src;
  try { src = fs.readFileSync(fpath, 'utf8'); } catch (_) { return; }
  if (!src.includes('??')) return;
  const fixed = fixSource(src);
  if (fixed === src) return;
  try {
    fs.writeFileSync(fpath, fixed, 'utf8');
    process.stderr.write('[vite-patch] 💾 ' + label + ' fixed ' + path.basename(fpath) + '\n');
  } catch (e) {
    process.stderr.write('[vite-patch] ✗ write error ' + path.basename(fpath) + ': ' + e.message + '\n');
  }
}

function patchViteChunks(label) {
  label = label || 'manual';
  const chunksDir = path.join(__dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks');
  if (!fs.existsSync(chunksDir)) return;

  let files;
  try { files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js')); }
  catch (_) { return; }

  for (const fname of files) {
    applyFixToDisk(path.join(chunksDir, fname), label);
  }
}

function watchViteChunks() {
  const chunksDir = path.join(__dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks');
  if (!fs.existsSync(chunksDir)) return;

  let files;
  try { files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js')); }
  catch (_) { return; }

  for (const fname of files) {
    const fpath = path.join(chunksDir, fname);

    // ── fs.watch: OS-level events, near-instant (~1ms) ──
    if (!fsWatchers.has(fpath)) {
      try {
        const watcher = fs.watch(fpath, { persistent: false }, (event) => {
          if (event === 'change') applyFixToDisk(fpath, 'watch');
        });
        watcher.on('error', () => {}); // ignore watcher errors
        fsWatchers.set(fpath, watcher);
      } catch (_) { /* fs.watch may be unavailable on some systems */ }
    }

    // ── fs.watchFile: polling fallback at 100ms ──
    if (!pollWatched.has(fpath)) {
      pollWatched.add(fpath);
      fs.watchFile(fpath, { persistent: false, interval: 100 }, () => {
        applyFixToDisk(fpath, 'poll');
      });
    }
  }
}

// ── Initial fixes ──────────────────────────────────────────────────────────

// Pass 1: before requiring Vite (catches pre-corruption)
patchViteChunks('pre-require');

// Start watchers immediately so any patcher activity is caught
watchViteChunks();

// ─────────────────────────────────────────────────────────────────────────────
const { defineConfig } = require('vite');
// ─────────────────────────────────────────────────────────────────────────────

// Pass 2: immediately after Vite loads (catches post-require re-corruption)
patchViteChunks('post-require');

// Pass 3-N: periodic safety net for the first 8 seconds (covers lazy patcher runs)
let periodicPasses = 0;
const periodicInterval = setInterval(() => {
  patchViteChunks('periodic-' + (++periodicPasses));
  if (periodicPasses >= 40) clearInterval(periodicInterval); // stop after 8s
}, 200);

// ─────────────────────────────────────────────────────────────────────────────
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
            // Pass at rollup transform start — last chance before module graph walk
            patchViteChunks('buildStart');
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
