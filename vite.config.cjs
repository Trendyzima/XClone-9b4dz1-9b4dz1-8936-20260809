const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy A — ESM module load hook  (v9)
//
// v9 key change: primary regex now uses lookbehind (?<=[^\s]) to match only
// tight-?? (no whitespace before ??), which is the patcher's signature.
// Also uses gs flags for dotAll + global, catching multi-line injections.
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
      const result = Atomics.wait(arr, 0, 0, 5000); // up to 5s
      if (result === 'ok') {
        process.stderr.write('[vite-patch] ✅ ESM hook registered & synchronised\n');
      } else {
        // 'not-equal' means hook worker already signalled before we waited — that's fine
        process.stderr.write('[vite-patch] ✅ ESM hook registered (' + result + ' — hook already ready)\n');
      }
    } else {
      const end = Date.now() + 400;
      while (Date.now() < end) { /* spin-wait */ }
      process.stderr.write('[vite-patch] ✅ ESM hook registered (spin-wait fallback)\n');
    }
  } catch (e) {
    process.stderr.write('[vite-patch] ❌ ESM hook registration failed: ' + e.message + '\n');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy B — Disk-based fix + continuous file watchers  (v9)
//
// v9: Same lookbehind-based regex as the ESM hook, plus fs.watch OS-level
//     events + fs.watchFile polling + periodic passes every 200ms.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Disk-fix corruption regex (mirrors vite-fix-loader.mjs) ─────────────────
//
// Lookbehind (?<=[^\s]): ?? not preceded by whitespace = patcher-injected.
// gs flags: dotAll + global — catches multi-line injections.
//
const CORRUPT_RE_DISK =
  /(?<=[^\s])\?\?\s*(?:"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\}|\[\s*\]|null\b|undefined\b|false\b|0\b)/gs;

// Identifier-capture fallback regex (no lookbehind required)
const CORRUPT_RE_FALLBACK =
  /\b(\w+(?:\([^)]*\))*)\?\?\s*(?:"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\}|\[\s*\]|null\b|undefined\b|false\b|0\b)/g;

function fixSource(src) {
  // ── Pass 1: Lookbehind tight-?? removal ──
  let fixed = src.replace(CORRUPT_RE_DISK, '');

  // ── Pass 2: replaceDefine belt-and-suspenders ──
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

  // ── Pass 3: Identifier-capture regex for any remaining ──
  fixed = fixed.replace(CORRUPT_RE_FALLBACK, '$1');

  // Reset regex state (stateful due to global flag)
  CORRUPT_RE_DISK.lastIndex = 0;

  return fixed;
}

// ── Watcher tracking ──────────────────────────────────────────────────────────
const fsWatchers  = new Map();
const pollWatched = new Set();

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

    // fs.watch: OS-level inotify/kqueue — ~1ms latency
    if (!fsWatchers.has(fpath)) {
      try {
        const w = fs.watch(fpath, { persistent: false }, (event) => {
          if (event === 'change') applyFixToDisk(fpath, 'watch');
        });
        w.on('error', () => {});
        fsWatchers.set(fpath, w);
      } catch (_) {}
    }

    // fs.watchFile: polling fallback at 100ms
    if (!pollWatched.has(fpath)) {
      pollWatched.add(fpath);
      fs.watchFile(fpath, { persistent: false, interval: 100 }, () => {
        applyFixToDisk(fpath, 'poll');
      });
    }
  }
}

// ── Initial disk fixes ────────────────────────────────────────────────────────

// Pass 1: before requiring Vite
patchViteChunks('pre-require');
watchViteChunks();

// ─────────────────────────────────────────────────────────────────────────────
const { defineConfig } = require('vite');
// ─────────────────────────────────────────────────────────────────────────────

// Pass 2: immediately after Vite loads (catches post-require re-corruption)
patchViteChunks('post-require');

// Passes 3-N: periodic safety net for the first 4 seconds (reduced from 50→20 passes)
let periodicPasses = 0;
const periodicInterval = setInterval(() => {
  patchViteChunks('periodic-' + (++periodicPasses));
  if (periodicPasses >= 20) clearInterval(periodicInterval); // stop after 4s
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
