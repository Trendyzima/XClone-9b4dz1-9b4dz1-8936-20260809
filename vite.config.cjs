const fs   = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// Nuclear targeted fixes
// ═══════════════════════════════════════════════════════════════════════════════
function ultraDirectFix(src) {
  let s = src;
  s = s.split('code??"", ').join('code, ');
  s = s.split("code??'', ").join('code, ');
  s = s.split('code??"",').join('code,');
  s = s.split("code??'',").join('code,');
  s = s.split('code??""').join('code');
  s = s.split("code??''").join('code');
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?"([^"\\]*)"/g, '$1');
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?'([^'\\]*)'/g, '$1');
  s = s.replace(/\?\?"[^"]*"/g, '');
  s = s.replace(/\?\?'[^']*'/g, '');
  s = s.replace(/([A-Za-z_$][A-Za-z0-9_$]*)\?\?(?=\s*\([^)]{0,200}\)\s*\{)/g, '$1');
  return s;
}

function nuclearFix(src) {
  let s = src;
  s = s.replace(/\basync function replaceDefine\(code\?\?"[^"]*",\s*/g, 'async function replaceDefine(code, ');
  s = s.replace(/\basync function replaceDefine\(code\?\?'[^']*',\s*/g, "async function replaceDefine(code, ");
  s = s.replace(/\breplaceDefine\(code\?\?"[^"]*",\s*/g, 'replaceDefine(code, ');
  s = s.replace(/\breplaceDefine\(code\?\?'[^']*',\s*/g, "replaceDefine(code, ");
  s = s.replace(/([(,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*)\?\?"[^"]*"/g, '$1');
  s = s.replace(/([(,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*)\?\?'[^']*'/g, '$1');
  {
    let out = '';
    let i = 0;
    while (i < s.length) {
      if (s[i] === '?' && s[i + 1] === '?') {
        let j = i + 2;
        while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) j++;
        const rem = s.slice(j, j + 120);
        const mdef = rem.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]{0,80}\)\s*\{/);
        if (mdef) {
          const prev = out.length > 0 ? out[out.length - 1] : '';
          if (!(prev === '}' || prev === '' || /[\n\r,{([]/.test(prev))) {
            out += ',';
          }
          out += s.slice(i + 2, j);
          i = j;
          continue;
        }
      }
      out += s[i];
      i++;
    }
    s = out;
  }
  return s;
}

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
      while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
      let endPos = -1;
      if (j >= n) {
        endPos = i + 2;
      } else {
        const c = src[j];
        if (c === '\r' || c === '\n') {
          endPos = i + 2;
        } else if (c === '{') {
          let k = j + 1;
          while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
          endPos = (k < n && src[k] === '}') ? k + 1 : i + 2;
        } else if (c === '"' || c === "'") {
          const q = c;
          let k = j + 1;
          while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; }
          if (k < n) endPos = k + 1;
        } else if (c === '[') {
          let k = j + 1;
          while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
          if (k < n && src[k] === ']') endPos = k + 1;
        } else if (c === '(') {
          endPos = i + 2;
        } else {
          const rest = src.slice(j);
          const m = rest.match(/^(null|undefined|false|0)(?!\w)/);
          if (m) {
            endPos = j + m[1].length;
          } else if (/^[a-zA-Z_$]/.test(c)) {
            endPos = i + 2;
          }
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
  let fixed = ultraDirectFix(src);
  fixed = nuclearFix(fixed);
  fixed = fixed.replace(/(\r?\n)([ \t]*)\?\?(?=[^\s?])/g, '$1$2');
  fixed = fixed.replace(
    /\?\?(\r?\n[ \t]*)(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{)/g,
    '$1'
  );
  fixed = fixed.replace(
    /\?\?(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{)/g,
    ' '
  );
  fixed = fixed.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?(?=\s*\([^)]{0,200}\)\s*\{)/g,
    '$1'
  );
  fixed = fixed.replace(/^[ \t]*\?\?(?=[^\s?])/gm, '');
  fixed = fixed.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?(\r?\n)/g, '$1$2');
  fixed = fixTightDoubleQuestion(fixed);
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');
  fixed = fixed.replace(
    /(?<=[^\s])\?\?\s*(?:"[^"]*"|'[^']*'|\[\s*\]|null\b|undefined\b|false\b|0\b)/g,
    ''
  );
  return fixed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Patch Vite chunks on disk (no persistent watchers — avoids process hang)
// ═══════════════════════════════════════════════════════════════════════════════
function applyFixToDisk(fpath, label) {
  try { fs.chmodSync(fpath, 0o644); } catch (_) {}
  let src;
  try { src = fs.readFileSync(fpath, 'utf8'); } catch (_) { return; }
  if (!src.includes('??')) return;
  const fixed = fixSource(src);
  if (fixed === src) return;
  try {
    fs.writeFileSync(fpath, fixed, 'utf8');
    try { fs.chmodSync(fpath, 0o444); } catch (_) {}
    process.stderr.write('[vite-patch] 💾 ' + label + ' fixed ' + path.basename(fpath) + '\n');
  } catch (e) {
    process.stderr.write('[vite-patch] ✗ write error ' + path.basename(fpath) + ': ' + e.message + '\n');
  }
}

function patchViteChunks(label) {
  const chunksDir = path.join(__dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks');
  if (!fs.existsSync(chunksDir)) return;
  let files;
  try { files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js')); } catch (_) { return; }
  for (const fname of files) applyFixToDisk(path.join(chunksDir, fname), label);
}

// Run patches synchronously — NO setInterval, NO fs.watchFile, NO Atomics.wait
patchViteChunks('pre-require');

// ────────────────────────────────────────────────────────────────────────────
const { defineConfig } = require('vite');
// ────────────────────────────────────────────────────────────────────────────

patchViteChunks('post-require');

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
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        jsx: 'react-jsx',
        jsxImportSource: 'react',
        module: 'ESNext',
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        noEmit: true,
        strict: false,
        skipLibCheck: true,
        baseUrl: '.',
        paths: { '@/*': ['./src/*'] },
      },
    },
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
          transform(code, id) {
            if (id.includes('/vite/dist/node/') && code.includes('??')) {
              const fixed = fixSource(code);
              if (fixed !== code) return { code: fixed, map: null };
            }
            return null;
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
