const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy A — ESM module load hook  (v5: synchronized startup)
//
// Problem: module.register() is async. The hook worker needs time to spin up.
// If Vite loads dep-C6uTJdX2.js during that window the hook misses it and
// Node's default loader sees the corrupted source → SyntaxError.
//
// Fix: use SharedArrayBuffer + Atomics to BLOCK the main thread here until
// the hook worker calls initialize() and signals it is ready.  After the
// Atomics.wait() returns the hook is guaranteed to intercept every subsequent
// ESM import, including the corrupted Vite chunks.
// ═══════════════════════════════════════════════════════════════════════════════
try {
  const nodeModule = require('module');
  if (typeof nodeModule.register === 'function') {
    const hookFile = path.join(__dirname, 'vite-fix-loader.mjs');
    if (fs.existsSync(hookFile)) {
      // Create a 4-byte shared buffer: 0 = hook not ready, 1 = hook ready
      const sab = new SharedArrayBuffer(4);
      const arr = new Int32Array(sab);
      Atomics.store(arr, 0, 0);

      // Register the hook and pass the SAB so initialize() can signal us
      nodeModule.register(
        pathToFileURL(hookFile).href,
        pathToFileURL(__filename).href,
        { data: { sab } }
      );

      // Block until the hook worker signals it is alive (≤ 1 000 ms)
      const waitResult = Atomics.wait(arr, 0, 0, 1000);
      if (waitResult === 'ok') {
        process.stderr.write('[vite-patch] \u2705 ESM load hook registered & synchronized\n');
      } else {
        // timed-out — hook might still work, just wasn't signalled in time
        process.stderr.write('[vite-patch] \u26a0\ufe0f  ESM hook timeout (' + waitResult + ') — proceeding anyway\n');
      }
    } else {
      process.stderr.write('[vite-patch] \u26a0\ufe0f  vite-fix-loader.mjs not found \u2013 skipping hook\n');
    }
  } else {
    process.stderr.write('[vite-patch] \u2139\ufe0f  module.register not available (Node < 20.6)\n');
  }
} catch (e) {
  process.stderr.write('[vite-patch] \u274c ESM hook registration failed: ' + e.message + '\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy B — Disk-based fix
//
// Scans ALL .js files in Vite's chunks dir and removes the ?? corruption the
// OnSpace patcher injects.  Runs three times (pre-require, post-require,
// buildStart) to catch re-corruption by the patcher at any phase.
//
// Note: chmod 444 is kept as a best-effort lock.  On systems where the patcher
// runs as root it will be ignored, but the ESM hook (Strategy A) then acts as
// the definitive fix.
// ═══════════════════════════════════════════════════════════════════════════════
function patchViteChunks() {
  const chunksDir = path.join(
    __dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks'
  );

  if (!fs.existsSync(chunksDir)) {
    process.stderr.write('[vite-patch] chunks dir not found: ' + chunksDir + '\n');
    return;
  }

  let files;
  try {
    files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js'));
  } catch (e) {
    process.stderr.write('[vite-patch] readdir error: ' + e.message + '\n');
    return;
  }

  for (const fname of files) {
    const fpath = path.join(chunksDir, fname);

    // Ensure readable + writable before we do anything
    try { fs.chmodSync(fpath, 0o644); } catch (_) {}

    let src;
    try {
      src = fs.readFileSync(fpath, 'utf8');
    } catch (e) {
      process.stderr.write('[vite-patch] read error for ' + fname + ': ' + e.message + '\n');
      try { fs.chmodSync(fpath, 0o444); } catch (_) {}
      continue;
    }

    // Fast exit — no ?? corruption present
    if (!src.includes('??')) {
      try { fs.chmodSync(fpath, 0o444); } catch (_) {}
      continue;
    }

    let fixed = src;

    // Blanket fix: identifier(optional args)??"string" → identifier(optional args)
    // No \s* around ?? — avoids touching legitimate  value ?? "default"  patterns
    fixed = fixed.replace(/\b(\w+(?:\([^)]*\))*)\?\?["'][^"']*["']/g, '$1');

    // Belt-and-suspenders for the known replaceDefine variants
    if (fixed.includes('replaceDefine(code??')) {
      fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
      fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
      fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
      fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
      fixed = fixed.replace(
        /replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g,
        'replaceDefine(code, '
      );
    }

    try {
      fs.writeFileSync(fpath, fixed, 'utf8');
      process.stderr.write('[vite-patch] \ud83d\udcbe disk-fixed ' + fname + '\n');
    } catch (e) {
      process.stderr.write('[vite-patch] write error for ' + fname + ': ' + e.message + '\n');
    }

    // Best-effort lock (prevents non-root patcher re-corruption)
    try {
      fs.chmodSync(fpath, 0o444);
      process.stderr.write('[vite-patch] \ud83d\udd12 locked ' + fname + '\n');
    } catch (_) {}
  }
}

// Run once before requiring Vite
patchViteChunks();

// ─────────────────────────────────────────────────────────────────────────────
const { defineConfig } = require('vite');
// ─────────────────────────────────────────────────────────────────────────────

// Run again immediately after Vite is loaded
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
