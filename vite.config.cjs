const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy A — ESM module load hook (in-memory, fires right before V8 compiles)
//
// OnSpace's patcher re-corrupts dep-*.js on disk after our previous disk-fix ran,
// so a disk-only approach loses the race.  A Node.js load hook intercepts the
// source text AFTER the file is read but BEFORE Node.js parses it, so it works
// regardless of what's on disk at that moment.
// ═══════════════════════════════════════════════════════════════════════════════
try {
  const nodeModule = require('module');
  if (typeof nodeModule.register === 'function') {
    const hookFile = path.join(__dirname, 'vite-fix-loader.mjs');
    if (fs.existsSync(hookFile)) {
      nodeModule.register(pathToFileURL(hookFile).href);
      process.stderr.write('[vite-patch] ✅ ESM load hook registered\n');
    } else {
      process.stderr.write('[vite-patch] ⚠️  vite-fix-loader.mjs not found – skipping hook\n');
    }
  } else {
    process.stderr.write('[vite-patch] ℹ️  module.register not available (Node < 20.6)\n');
  }
} catch (e) {
  process.stderr.write('[vite-patch] ❌ ESM hook registration failed: ' + e.message + '\n');
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

    // Make writable first (patcher may install the file as read-only 0444)
    try { fs.chmodSync(fpath, 0o644); } catch (e) {
      process.stderr.write('[vite-patch] chmod error for ' + fname + ': ' + e.message + '\n');
    }

    try {
      fs.writeFileSync(fpath, fixed, 'utf8');
      process.stderr.write('[vite-patch] 💾 disk-fixed ' + fname + '\n');
    } catch (e) {
      process.stderr.write('[vite-patch] write error for ' + fname + ': ' + e.message + '\n');
    }
  }
}

// Run before require('vite') in case file is already corrupted from a prior run
patchViteChunks();

// ─────────────────────────────────────────────────────────────────────────────
const { defineConfig } = require('vite');
// ─────────────────────────────────────────────────────────────────────────────

// Run again after require('vite') — the patcher may trigger during CJS loading
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
