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
    files = fs.readdirSync(chunksDir).filter(
      f => f.startsWith('dep-') && f.endsWith('.js')
    );
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

    if (!src.includes('replaceDefine(code??')) continue;

    let fixed = src;
    fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
    fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
    fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
    fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
    if (fixed.includes('replaceDefine(code??')) {
      fixed = fixed.replace(
        /replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g,
        'replaceDefine(code, '
      );
    }

    if (fixed === src) continue;

    try { fs.chmodSync(fpath, 0o644); } catch (e) {
      process.stderr.write('[vite-patch] chmod error for ' + fname + ': ' + e.message + '\n');
    }

    try {
      fs.writeFileSync(fpath, fixed, 'utf8');
      process.stderr.write('[vite-patch] \ud83d\udcbe disk-fixed ' + fname + '\n');
    } catch (e) {
      process.stderr.write('[vite-patch] write error for ' + fname + ': ' + e.message + '\n');
    }
  }
}

patchViteChunks();

// ─────────────────────────────────────────────────────────────────────────────
const { defineConfig } = require('vite');
// ─────────────────────────────────────────────────────────────────────────────

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
            if (!id.includes('node_modules') || !id.endsWith('.mjs')) return null;

            let modified = code;
            let changed   = false;
            let counter   = 0;

            // ── Fix 1: default import from 'react' ──────────────────────────
            const defaultRe = /import ([A-Za-z_$][A-Za-z0-9_$]*) from ['"]react['"]\s*;?/g;
            if (defaultRe.test(modified)) {
              defaultRe.lastIndex = 0;
              modified = modified.replace(
                defaultRe,
                (_, name) => 'import * as ' + name + " from 'react';"
              );
              changed = true;
            }

            // ── Fix 2: named imports from CJS React sub-packages ─────────────
            const CJS_PKGS = [
              'react/jsx-runtime',
              'react/jsx-dev-runtime',
              'react-dom',
            ];

            for (const pkg of CJS_PKGS) {
              // Build regex: import { ... } from 'pkg'
              const escapedPkg = pkg.replace(/\//g, '\\/');
              const namedRe = new RegExp(
                'import\\s+\\{([^}]+)\\}\\s+from\\s+[\'"]+' + escapedPkg + '[\'"]+\\s*;?',
                'g'
              );
              // Use a one-shot (non-global) copy for the guard test
              if (!new RegExp(namedRe.source).test(modified)) continue;
              namedRe.lastIndex = 0;

              modified = modified.replace(namedRe, function(_, specifiers) {
                var varName = '_ci' + (counter++);
                // 'Fragment as Fragment2' → 'Fragment: Fragment2'
                // 'jsx'                  → 'jsx'
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
