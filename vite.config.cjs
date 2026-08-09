const fs = require('fs');
const path = require('path');

// ─── Self-heal: fix OnSpace patcher bug that corrupts replaceDefine ──────────
// The patcher incorrectly places ??"" in the function PARAMETER LIST (syntax
// error) instead of the body.  Scan every dep-*.js chunk and remove it.
try {
  const chunksDir = path.join(__dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks');
  if (fs.existsSync(chunksDir)) {
    for (const fname of fs.readdirSync(chunksDir)) {
      if (!/^dep-.*\.js$/.test(fname)) continue;
      const fpath = path.join(chunksDir, fname);
      const src = fs.readFileSync(fpath, 'utf8');
      // Pattern: replaceDefine(code??"", → replaceDefine(code,
      if (!src.includes('replaceDefine(code??,') && !src.includes('replaceDefine(code??""')) continue;
      const fixed = src
        .replace(/replaceDefine\(code\?\?""[,\s]/g, 'replaceDefine(code, ')
        .replace(/replaceDefine\(code\?\?,[\s]*/g,  'replaceDefine(code, ');
      if (fixed !== src) {
        fs.writeFileSync(fpath, fixed, 'utf8');
        console.log('[self-heal] Fixed corrupted replaceDefine signature in', fname);
      }
    }
  }
} catch (_) { /* best-effort — never block the build */ }

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
