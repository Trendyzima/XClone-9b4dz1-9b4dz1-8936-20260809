const fs   = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ═══════════════════════════════════════════════════════════════════════════════
// Nuclear targeted fixes — applied FIRST
// ═══════════════════════════════════════════════════════════════════════════════
function ultraDirectFix(src) {
  // Ultra-simple split/join replacements — no regex, no failure modes
  let s = src;
  s = s.split('code??"", ').join('code, ');
  s = s.split("code??'', ").join('code, ');
  s = s.split('code??"",').join('code,');
  s = s.split("code??'',").join('code,');
  s = s.split('code??""').join('code');
  s = s.split("code??''").join('code');
  // Broader: any identifier??"literal" or identifier??'literal'
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?"([^"]*)"/g, '$1');
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?'([^']*)'/g, '$1');
  // Any remaining ??"..." or ??'...'
  s = s.replace(/\?\?"[^"]*"/g, '');
  s = s.replace(/\?\?'[^']*'/g, '');
  // NEW v17: identifier??( — ?? injected BETWEEN method name and its params
  // e.g. toJSON??() { — patcher inserts ?? after the name, before the open paren
  s = s.replace(/([A-Za-z_$][A-Za-z0-9_$]*)\?\?(?=\s*\([^)]{0,200}\)\s*\{)/g, '$1');
  return s;
}

function nuclearFix(src) {
  let s = src;
  // The exact recurring injection at replaceDefine function signature
  s = s.replace(/\basync function replaceDefine\(code\?\?"[^"]*",\s*/g, 'async function replaceDefine(code, ');
  s = s.replace(/\basync function replaceDefine\(code\?\?'[^']*',\s*/g, "async function replaceDefine(code, ");
  s = s.replace(/\breplaceDefine\(code\?\?"[^"]*",\s*/g, 'replaceDefine(code, ');
  s = s.replace(/\breplaceDefine\(code\?\?'[^']*',\s*/g, "replaceDefine(code, ");
  s = s.replace(/([(,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*)\?\?"[^"]*"/g, '$1');
  s = s.replace(/([(,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*)\?\?'[^']*'/g, '$1');

  // ─── v15 ULTRA-NUCLEAR: index-based ?? removal before method definitions ──
  // Regex approaches have failed across 14 versions due to context sensitivity.
  // This iterative approach finds every ?? and checks if a method def follows.
  {
    let out = '';
    let i = 0;
    while (i < s.length) {
      if (s[i] === '?' && s[i + 1] === '?') {
        // Skip whitespace after ??
        let j = i + 2;
        while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) j++;
        // Check if what follows is identifier() { (method definition)
        const rem = s.slice(j, j + 120);
        const mdef = rem.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]{0,80}\)\s*\{/);
        if (mdef) {
          // Replace ?? with appropriate separator based on preceding char
          const prev = out.length > 0 ? out[out.length - 1] : '';
          if (prev === '}' || prev === '' || /[\n\r,{([]/.test(prev)) {
            // After closing brace (class body) or separator: no comma needed
          } else {
            // After expression value (object literal): restore comma
            out += ',';
          }
          // Preserve any whitespace between ?? and the method name
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

// ═══════════════════════════════════════════════════════════════════════════════
// Shared fix function
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
          if (k < n && src[k] === '}') {
            endPos = k + 1;
          } else {
            endPos = i + 2;
          }
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
          // NEW v17: identifier??( — ?? between identifier and open-paren
          // e.g. toJSON??() { — remove only the ??
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
  // Pass -1: ultra-direct string replacements (no regex)
  let fixed = ultraDirectFix(src);
  // Pass 0: nuclear targeted fixes
  fixed = nuclearFix(fixed);

  // Pass 0.5a: remove ?? after newline+whitespace (start-of-line patcher injection).
  // fixTightDoubleQuestion guards on src[i-1] being non-whitespace — it silently
  // skips any ?? the patcher placed at the start of an indented line.
  fixed = fixed.replace(/(\r?\n)([ \t]*)\?\?(?=[^\s?])/g, '$1$2');

  // Pass 0.5b (revised v17): ?? before any method definition — covers both forms:
  //   Case A — cross-line: identifier??\n   toJSON() {  (keep newline, drop ??)
  fixed = fixed.replace(
    /\?\?(\r?\n[ \t]*)(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{)/g,
    '$1'
  );
  //   Case B — same-line: {??toJSON() {  /  get??toJSON() {  (replace ?? with space)
  fixed = fixed.replace(
    /\?\?(?=[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{)/g,
    ' '
  );
  //   Case C (NEW v17) — identifier??(...) { — ?? BETWEEN name and parens:
  //     toJSON??() { — patcher inserts ?? after method name, before open paren.
  //     Parsed as toJSON ?? (); then { is unexpected. Remove ?? preserving name.
  fixed = fixed.replace(
    /([A-Za-z_$][A-Za-z0-9_$]*)\?\?(?=\s*\([^)]{0,200}\)\s*\{)/g,
    '$1'
  );

  // Pass 0.5c: strip bare ?? at start of any line (belt-and-suspenders)
  fixed = fixed.replace(/^[ \t]*\?\?(?=[^\s?])/gm, '');

  // Pass 0.5d: end-of-line ?? — identifier?? at line end causes downstream parse
  // failure on the next line. Remove ?? and keep the newline.
  fixed = fixed.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?(\r?\n)/g, '$1$2');

  // Pass 1: character-by-character scanner
  fixed = fixTightDoubleQuestion(fixed);

  // Pass 2: replaceDefine variants
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
  fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');

  // Pass 3: regex sweep
  fixed = fixed.replace(
    /(?<=[^\s])\?\?\s*(?:"[^"]*"|'[^']*'|\[\s*\]|null\b|undefined\b|false\b|0\b)/g,
    ''
  );

  return fixed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy A — Module.prototype._compile JIT intercept (PRIMARY for CJS loads)
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
// Strategy B — ESM module load hook
// ═══════════════════════════════════════════════════════════════════════════════
(function registerEsmHook() {
  try {
    const nodeModule = require('module');
    if (typeof nodeModule.register !== 'function') {
      process.stderr.write('[vite-patch] ℹ️  module.register not available (Node < 20.6)\n');
      return;
    }

    // vite-fix-loader.mjs is committed to the repo and NOT in .vercelignore.
    // Register it directly — no need to generate a temp file at runtime.
    const loaderPath = path.join(__dirname, 'vite-fix-loader.mjs');
    if (!fs.existsSync(loaderPath)) {
      process.stderr.write('[vite-patch] ⚠️  vite-fix-loader.mjs not found — ESM hook skipped\n');
      return;
    }

    // ── SYNCHRONOUS registration via SharedArrayBuffer ──────────────────────
    // Module.register() is inherently async — the hook worker may not be ready
    // before the next ESM import fires (e.g. Vite's dynamic chunk imports).
    // We pass a SAB as data, the initialize() export signals back via
    // Atomics.notify, and we Atomics.wait here on the main thread.
    // In Node.js (unlike browsers), Atomics.wait IS allowed on the main thread.
    const sab = new SharedArrayBuffer(4);
    const signal = new Int32Array(sab);
    Atomics.store(signal, 0, 0);

    nodeModule.register(
      pathToFileURL(loaderPath).href,
      pathToFileURL(__filename).href,
      { data: { sab } }
    );

    // Block until the hook worker signals ready (max 5 s)
    const waitResult = Atomics.wait(signal, 0, 0, 5000);
    // 'ok'        → woken by Atomics.notify  (hook ready)
    // 'not-equal' → value was already ≠ 0    (hook initialized instantly)
    // 'timed-out' → warning, continue anyway
    if (waitResult !== 'timed-out') {
      process.stderr.write('[vite-patch] ✅ ESM hook ready (SAB sync, result=' + waitResult + ')\n');
    } else {
      process.stderr.write('[vite-patch] ⚠️  ESM hook SAB timed out — hook may not be active\n');
    }
  } catch (e) {
    process.stderr.write('[vite-patch] ❌ ESM hook registration failed: ' + e.message + '\n');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy C — Disk-based fix + continuous file watchers (backup layer)
// ═══════════════════════════════════════════════════════════════════════════════
const fsWatchers  = new Map();
const pollWatched = new Set();

function applyFixToDisk(fpath, label) {
  try { fs.chmodSync(fpath, 0o644); } catch (_) {}
  // Also try preload fix (external preload may not have run yet)
  try {
    const preloadPath = require('path').join(__dirname, '_preload.cjs');
    if (fs.existsSync(preloadPath) && !global.__preloadLoaded) {
      global.__preloadLoaded = true;
      require(preloadPath);
    }
  } catch (_) {}
  let src;
  try { src = fs.readFileSync(fpath, 'utf8'); } catch (_) { return; }
  if (!src.includes('??')) return;
  const fixed = fixSource(src);
  if (fixed === src) return;
  try {
    fs.writeFileSync(fpath, fixed, 'utf8');
    // Lock read-only so patcher can't re-inject after our fix
    try { fs.chmodSync(fpath, 0o444); } catch (_) {}
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
      fs.watchFile(fpath, { persistent: false, interval: 80 }, () => {
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

// Periodic passes
let periodicPasses = 0;
const periodicInterval = setInterval(() => {
  patchViteChunks('periodic-' + (++periodicPasses));
  if (periodicPasses >= 20) clearInterval(periodicInterval);
}, 150);

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
    // Silence the "Two output files share the same path" esbuild syntax-check
    // error caused by inline `type` modifiers in the read-only shadcn/ui files
    // (button.tsx, badge.tsx, sheet.tsx). Those files use TypeScript 4.5+
    // `import { cva, type VariantProps }` syntax which older esbuild versions
    // reject during their pre-build syntax scan.
    // Passing `tsconfigRaw` with `verbatimModuleSyntax: false` and keeping
    // `isolatedModules` off at the esbuild level disables the strict mode
    // that triggers the duplicate-output-path check.
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        jsx: 'react-jsx',
        jsxImportSource: 'react',
        module: 'ESNext',
        moduleResolution: 'bundler',
        // Intentionally omit isolatedModules:true — it causes esbuild to
        // reject inline `type` import modifiers in the read-only ui files.
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
