'use strict';
const fs   = require('fs');
const path = require('path');

/* ─── Surgical Vite-chunk patcher (same logic as _patch-vite.cjs) ─────────── */
function fixSource(src) {
  if (!src.includes('code??')) return src;
  let o = src;
  o = o.split('code??"", ').join('code, ');
  o = o.split("code??'', ").join('code, ');
  o = o.split('code??"",').join('code,');
  o = o.split("code??'',").join('code,');
  o = o.split('code??""').join('code');
  o = o.split("code??''").join('code');
  return o;
}

function patchViteChunks() {
  const dir = path.join(__dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks');
  if (!fs.existsSync(dir)) return;
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.js')); } catch (_) { return; }
  for (const f of files) {
    const fp = path.join(dir, f);
    try {
      try { fs.chmodSync(fp, 0o644); } catch (_) {}
      const src = fs.readFileSync(fp, 'utf8');
      if (!src.includes('code??')) { try { fs.chmodSync(fp, 0o444); } catch (_) {} continue; }
      const out = fixSource(src);
      if (out === src) { try { fs.chmodSync(fp, 0o444); } catch (_) {} continue; }
      fs.writeFileSync(fp, out, 'utf8');
      try { fs.chmodSync(fp, 0o444); } catch (_) {}
    } catch (_) {}
  }
}

patchViteChunks();

/* ─── Vite config ──────────────────────────────────────────────────────────── */
const { defineConfig } = require('vite');

// Try to load @vitejs/plugin-react — it provides proper JSX + TSX handling
let reactPlugin = null;
try {
  const { default: react } = require('@vitejs/plugin-react');
  reactPlugin = react();
} catch (_) {}

const stub = path.resolve(__dirname, 'src/lib/capacitor-stub.ts');

/* ─── Rollup plugin: resolve extensionless TypeScript imports ──────────────── *
 * During Rollup's bundling phase, imports like `@/components/layout/AuthProvider`
 * resolve to an absolute path WITHOUT a .tsx extension. This plugin adds it.
 */
const resolveTypescriptExtensions = {
  name: 'resolve-ts-extensions',
  resolveId: {
    order: 'pre',
    handler(source, importer) {
      // Skip: already has an extension, or a bare module (no slash, no dot-start)
      if (/\.[jt]sx?$/.test(source)) return null;
      if (source.startsWith('\0')) return null;
      if (!source.startsWith('/') && !source.startsWith('.') && !source.startsWith('@/')) return null;

      let base;
      if (source.startsWith('@/')) {
        base = path.join(__dirname, 'src', source.slice(2));
      } else if (source.startsWith('/')) {
        base = source;
      } else if (importer) {
        const importerDir = path.dirname(importer.split('?')[0]);
        base = path.join(importerDir, source);
      } else {
        return null;
      }

      const exts = ['.tsx', '.ts', '.jsx', '.js'];

      // Try direct extensions
      for (const ext of exts) {
        const full = base + ext;
        if (fs.existsSync(full)) return full;
      }

      // Try index files
      for (const ext of exts) {
        const full = path.join(base, 'index' + ext);
        if (fs.existsSync(full)) return full;
      }

      return null;
    },
  },
};

module.exports = defineConfig({
  server: {
    host: '::',
    port: 8080,
  },

  plugins: reactPlugin ? [reactPlugin] : [],

  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
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
      external: (id) => /\.test\.[jt]sx?$/.test(id) || /\.spec\.[jt]sx?$/.test(id),
      plugins: [
        resolveTypescriptExtensions,
        {
          name: 'vite-chunk-repatch',
          buildStart() { patchViteChunks(); },
          transform(code, id) {
            if (id.includes('/vite/dist/node/') && code.includes('code??')) {
              const fixed = fixSource(code);
              if (fixed !== code) return { code: fixed, map: null };
            }
            return null;
          },
        },
      ],
      output: { interop: 'auto' },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.code === 'MISSING_EXPORT') return;
        warn(warning);
      },
    },
  },
});
