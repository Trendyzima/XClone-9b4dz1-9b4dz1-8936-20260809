const fs   = require('fs');
const path = require('path');

// ─── Self-heal: fix OnSpace patcher bug that corrupts replaceDefine ──────────
// The patcher puts ??"" in the PARAMETER LIST (syntax error) instead of the
// function body.  Scan every dep-*.js chunk, chmod it writable, then fix it.
(function patchViteChunks() {
  const chunksDir = path.join(
    __dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks'
  );

  let files;
  try {
    if (!fs.existsSync(chunksDir)) {
      process.stderr.write('[vite-patch] chunks dir not found: ' + chunksDir + '\n');
      return;
    }
    files = fs.readdirSync(chunksDir).filter(
      f => f.startsWith('dep-') && f.endsWith('.js')
    );
  } catch (e) {
    process.stderr.write('[vite-patch] cannot read chunks dir: ' + e.message + '\n');
    return;
  }

  for (const fname of files) {
    const fpath = path.join(chunksDir, fname);

    let src;
    try {
      src = fs.readFileSync(fpath, 'utf8');
    } catch (e) {
      process.stderr.write('[vite-patch] cannot read ' + fname + ': ' + e.message + '\n');
      continue;
    }

    // Quick escape: skip files that don't contain the corruption marker
    if (!src.includes('replaceDefine(code??')) continue;

    // Simple literal replacements – more reliable than regex for exact strings
    let fixed = src;
    // Variant 1: replaceDefine(code??"", id  (double-quote, comma+space)
    fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
    // Variant 2: replaceDefine(code??"",id   (double-quote, comma no-space)
    fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
    // Variant 3: single-quote variant
    fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
    fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');

    // Fallback: regex for any ??"..." or ??'...' in the parameter position
    if (fixed.includes('replaceDefine(code??')) {
      fixed = fixed.replace(
        /replaceDefine\(code\s*\?\?["'][^"']*["']\s*,\s*/g,
        'replaceDefine(code, '
      );
    }

    if (fixed === src) continue; // Nothing to fix

    try {
      // Make writable first (the file may be installed as read-only 0444)
      fs.chmodSync(fpath, 0o644);
    } catch (e) {
      process.stderr.write('[vite-patch] chmod failed for ' + fname + ': ' + e.message + '\n');
    }

    try {
      fs.writeFileSync(fpath, fixed, 'utf8');
      process.stderr.write('[vite-patch] fixed ' + fname + '\n');
    } catch (e) {
      process.stderr.write('[vite-patch] write failed for ' + fname + ': ' + e.message + '\n');
    }
  }
})();

// ─────────────────────────────────────────────────────────────────────────────

const { defineConfig } = require('vite');

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
    rollupOptions: {
      output: {
        interop: 'auto',
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
});
