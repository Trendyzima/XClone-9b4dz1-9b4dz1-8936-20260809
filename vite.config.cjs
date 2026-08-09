const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy A — ESM module load hook (in-memory, fires right before V8 compiles)
// ═══════════════════════════════════════════════════════════════════════════════
try {
  const nodeModule = require('module');
  if (typeof nodeModule.register === 'function') {
    const hookFile = path.join(__dirname, 'vite-fix-loader.mjs');
    if (fs.existsSync(hookFile)) {
      nodeModule.register(pathToFileURL(hookFile).href);
      process.stderr.write('[vite-patch] \u2705 ESM load hook registered\n');
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
// Strategy B — Disk-based fix (backup; covers the window before hook fires)
// v2: Scans ALL .js files in the chunks dir (not just dep-*) and uses a blanket
//     regex to catch any identifier??["'..."] the OnSpace patcher may inject —
//     including when it appears in function DEFINITIONS, not just call sites.
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
    // Scan ALL .js files (patcher can target any chunk, not only dep- prefixed ones)
    files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js'));
  } catch (e) {
    process.stderr.write('[vite-patch] readdir error: ' + e.message + '\n');
    return;
  }

  for (const fname of files) {
    const fpath = path.join(chunksDir, fname);

    let src;
    try {
      src = fs.readFileSync(fpath, 'utf8');
    } catch (e) {
      process.stderr.write('[vite-patch] read error for ' + fname + ': ' + e.message + '\n');
      continue;
    }

    // Fast exit — no ?? corruption present
    if (!src.includes('??')) continue;

    let fixed = src;

    // ── Blanket fix: identifier??["'..."] → identifier ──────────────────────
    // Catches corruption in function DEFINITIONS and call sites alike.
    // Vite's pre-compiled chunks don't legitimately use ?? with string literals.
    fixed = fixed.replace(/\b(\w+)\s*\?\?\s*["'][^"']*["']/g, '$1');

    // ── Belt-and-suspenders: explicit variants for the known replaceDefine bug ─
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

    if (fixed === src) continue;

    try { fs.chmodSync(fpath, 0o644); } catch (_) {}

    try {
      fs.writeFileSync(fpath, fixed, 'utf8');
      process.stderr.write('[vite-patch] \ud83d\udcbe disk-fixed ' + fname + '\n');
    } catch (e) {
      process.stderr.write('[vite-patch] write error for ' + fname + ': ' + e.message + '\n');
    }
  }
}

// Run once before requiring Vite (so if the patcher already ran, we fix it)
patchViteChunks();

// ─────────────────────────────────────────────────────────────────────────────
const { defineConfig } = require('vite');
// ─────────────────────────────────────────────────────────────────────────────

// Run again immediately after Vite is loaded (belt-and-suspenders)
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
        // ── Strategy C: buildStart re-patch ──────────────────────────────────
        // The OnSpace patcher may run AFTER vite.config.cjs is first evaluated
        // (e.g. between config-load and the actual transform phase).
        // Re-running the disk fix in buildStart catches that late corruption.
        {
          name: 'vite-chunk-repatch',
          buildStart() {
            patchViteChunks();
          },
        },

        // ── Strategy D: Rollup ESM/CJS interop fix ───────────────────────────
        // Rollup's static linker fails before interop runs when .mjs files in
        // node_modules import from CJS React packages (react, react/jsx-runtime…).
        //
        // Fix 1: default imports  →  namespace import
        //   import React from 'react'
        //   → import * as React from 'react'
        //
        // Fix 2: named imports from CJS sub-packages → namespace + destructure
        //   import { jsx, Fragment as F } from 'react/jsx-runtime'
        //   → import * as _ci0 from 'react/jsx-runtime'; const { jsx, Fragment: F } = _ci0;
        {
          name: 'fix-esm-cjs-react-interop',
          transform(code, id) {
            // Apply to:
            //   • .mjs files inside node_modules (radix-ui etc.)
            //   • Any source TS/JS file — after Vite's esbuild pre-transform
            //     adds `import { jsx } from 'react/jsx-runtime'` for JSX files
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
