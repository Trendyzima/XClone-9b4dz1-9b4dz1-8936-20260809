const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ═══════════════════════════════════════════════════════════════════════════════
// fixTightDoubleQuestion(src)  — shared by ALL strategies
//
// Character-by-character scanner that removes tight-?? injections:
//   identifier??""     identifier??{}     identifier??[]
//   identifier??null   identifier??undefined   identifier??false   identifier??0
//   identifier??\n     (end-of-line injection)
//
// Handles ARBITRARY brace nesting depth and is string-literal aware.
// ═══════════════════════════════════════════════════════════════════════════════
function fixTightDoubleQuestion(src) {
  const n = src.length;
  let out = '';
  let i = 0;

  while (i < n) {
    if (
      src[i] === '?' &&
      i + 1 < n && src[i + 1] === '?' &&
      i > 0 && !/[\s]/.test(src[i - 1])
    ) {
      let j = i + 2;
      while (j < n && (src[j] === ' ' || src[j] === '\t')) j++; // skip horiz whitespace

      let endPos = -1;

      if (j >= n) {
        endPos = i + 2;                          // ?? at end of file
      } else {
        const c = src[j];

        if (c === '\r' || c === '\n') {
          endPos = i + 2;                        // ?? at end of line — remove only ??

        } else if (c === '{') {
          // Brace-count with string awareness — handles arbitrary depth
          let depth = 1, k = j + 1;
          let inStr = false, strCh = '';
          while (k < n && depth > 0) {
            const cc = src[k];
            if (inStr) {
              if (cc === '\\') k++;
              else if (cc === strCh) inStr = false;
            } else {
              if (cc === '"' || cc === "'" || cc === '`') { inStr = true; strCh = cc; }
              else if (cc === '{') depth++;
              else if (cc === '}') depth--;
            }
            k++;
          }
          if (depth === 0) endPos = k;

        } else if (c === '"' || c === "'") {
          const q = c;
          let k = j + 1;
          while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; }
          if (k < n) endPos = k + 1;

        } else if (c === '[') {
          let k = j + 1;
          while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
          if (k < n && src[k] === ']') endPos = k + 1;

        } else {
          const rest = src.slice(j);
          const m = rest.match(/^(null|undefined|false|0)(?!\w)/);
          if (m) endPos = j + m[1].length;
        }
      }

      if (endPos >= 0) { i = endPos; }
      else { out += src[i]; i++; }
      continue;
    }

    out += src[i];
    i++;
  }

  return out;
}

function fixSource(src) {
  if (!src.includes('??')) return src;

  // Pass 1: JIT character-by-character scanner
  let fixed = fixTightDoubleQuestion(src);

  // Pass 2: replaceDefine-specific belt-and-suspenders
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

  // Pass 3: regex sweep for remaining simple tight-?? patterns
  fixed = fixed.replace(
    /(?<=[^\s])\?\?\s*(?:"[^"]*"|'[^']*'|\[\s*\]|null\b|undefined\b|false\b|0\b)/g,
    ''
  );

  // Pass 4: identifier-capture fallback
  fixed = fixed.replace(
    /\b(\w+(?:\([^)]*\))*)\?\?\s*(?:"[^"]*"|'[^']*'|\[\s*\]|null\b|undefined\b|false\b|0\b)/g,
    '$1'
  );

  return fixed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy C — Module.prototype._compile JIT intercept  (NEW — PRIMARY DEFENSE)
//
// ROOT CAUSE: dep-C6uTJdX2.js is loaded via CJS require(), NOT ESM import.
// Our ESM load hook is therefore NEVER called for this file.
// The disk watcher loses the timing race: patcher can corrupt the file
// between our last disk-fix pass and the moment require() reads it.
//
// THIS hook fires synchronously inside every CJS module compilation,
// just BEFORE V8 parses the source — no timing race is possible.
// It works regardless of when the patcher wrote the corruption to disk.
// ═══════════════════════════════════════════════════════════════════════════════
(function installCompileHook() {
  try {
    const Module = require('module');
    const _orig = Module.prototype._compile;
    Module.prototype._compile = function _compileWithFix(content, filename) {
      if (
        filename &&
        filename.includes('/vite/dist/node/') &&
        content.includes('??')
      ) {
        const fixed = fixSource(content);
        if (fixed !== content) {
          process.stderr.write(
            '[vite-patch] 🔧 JIT _compile patched ' + path.basename(filename) + '\n'
          );
          return _orig.call(this, fixed, filename);
        }
      }
      return _orig.call(this, content, filename);
    };
    process.stderr.write('[vite-patch] ✅ Module._compile JIT hook installed\n');
  } catch (e) {
    process.stderr.write('[vite-patch] ❌ Module._compile hook failed: ' + e.message + '\n');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy A — ESM module load hook  (handles ESM-imported vite internals)
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
      process.stderr.write('[vite-patch] ⚠️  vite-fix-loader.mjs not found — skipping ESM hook\n');
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
    } catch (_) {}

    nodeModule.register(
      pathToFileURL(hookFile).href,
      pathToFileURL(__filename).href,
      { data: sabData }
    );

    if (usedAtomics) {
      const arr = new Int32Array(sabData.sab);
      const result = Atomics.wait(arr, 0, 0, 5000);
      process.stderr.write(
        '[vite-patch] ✅ ESM hook registered (' +
        (result === 'ok' ? 'synchronised' : result + ' — hook already ready') + ')\n'
      );
    } else {
      const end = Date.now() + 400;
      while (Date.now() < end) {}
      process.stderr.write('[vite-patch] ✅ ESM hook registered (spin-wait fallback)\n');
    }
  } catch (e) {
    process.stderr.write('[vite-patch] ❌ ESM hook registration failed: ' + e.message + '\n');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy B — Disk-based fix + continuous file watchers  (backup layer)
// ═══════════════════════════════════════════════════════════════════════════════
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
  try { files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js')); } catch (_) { return; }
  for (const fname of files) applyFixToDisk(path.join(chunksDir, fname), label);
}

function watchViteChunks() {
  const chunksDir = path.join(__dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks');
  if (!fs.existsSync(chunksDir)) return;
  let files;
  try { files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js')); } catch (_) { return; }

  for (const fname of files) {
    const fpath = path.join(chunksDir, fname);
    if (!fsWatchers.has(fpath)) {
      try {
        const w = fs.watch(fpath, { persistent: false }, (event) => {
          if (event === 'change') applyFixToDisk(fpath, 'watch');
        });
        w.on('error', () => {});
        fsWatchers.set(fpath, w);
      } catch (_) {}
    }
    if (!pollWatched.has(fpath)) {
      pollWatched.add(fpath);
      fs.watchFile(fpath, { persistent: false, interval: 100 }, () => {
        applyFixToDisk(fpath, 'poll');
      });
    }
  }
}

patchViteChunks('pre-require');
watchViteChunks();

// ────────────────────────────────────────────────────────────────────────────
const { defineConfig } = require('vite');
// ────────────────────────────────────────────────────────────────────────────

patchViteChunks('post-require');

// Periodic passes — belt-and-suspenders backup
let periodicPasses = 0;
const periodicInterval = setInterval(() => {
  patchViteChunks('periodic-' + (++periodicPasses));
  if (periodicPasses >= 20) clearInterval(periodicInterval);
}, 200);

// ────────────────────────────────────────────────────────────────────────────
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
        {
          name: 'vite-chunk-repatch',
          buildStart() {
            patchViteChunks('buildStart');
          },
        },
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

            const defaultRe = /import ([A-Za-z_$][A-Za-z0-9_$]*) from ['"]react['"]\s*;?/g;
            if (defaultRe.test(modified)) {
              defaultRe.lastIndex = 0;
              modified = modified.replace(
                defaultRe,
                (_, name) => 'import * as ' + name + " from 'react';"
              );
              changed = true;
            }

            const CJS_PKGS = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom'];
            for (const pkg of CJS_PKGS) {
              const escapedPkg = pkg.replace(/\//g, '\\/');
              const namedRe = new RegExp(
                'import\\s+\\{([^}]+)\\}\\s+from\\s+[\'"]+' + escapedPkg + '[\'"]+\\s*;?', 'g'
              );
              if (!new RegExp(namedRe.source).test(modified)) continue;
              namedRe.lastIndex = 0;
              modified = modified.replace(namedRe, function(_, specifiers) {
                var varName = '_ci' + (counter++);
                var destructured = specifiers.split(',').map(function(s) {
                  var t = s.trim();
                  var parts = t.split(/\s+as\s+/);
                  return parts.length === 2 ? parts[0].trim() + ': ' + parts[1].trim() : t;
                }).join(', ');
                return 'import * as ' + varName + " from '" + pkg + "'; const { " + destructured + ' } = ' + varName + ';';
              });
              changed = true;
            }

            return changed ? { code: modified, map: null } : null;
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
