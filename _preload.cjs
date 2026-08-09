/**
 * _preload.cjs
 *
 * Loaded via NODE_OPTIONS=--require ./_preload.cjs BEFORE any other module.
 * Fixes the OnSpace patcher's ?? injection into Vite's dist chunks at the
 * earliest possible moment — before Node even tries to compile them.
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const Module = require('module');

const CHUNKS_DIR = path.join(__dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks');

// ─── Ultra-simple direct string replacements ──────────────────────────────
function directFix(src) {
  let s = src;

  // Most common injection: identifier??"literal" or identifier??'literal'
  // Applied with plain split/join — zero regex dependency, zero failure modes
  s = s.split('code??"", ').join('code, ');
  s = s.split("code??'', ").join('code, ');
  s = s.split('code??"",').join('code,');
  s = s.split("code??'',").join('code,');
  s = s.split('code??""').join('code');
  s = s.split("code??''").join('code');

  // Broader: any identifier??""  or  identifier??''
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?"([^"]*)"/g, '$1');
  s = s.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\?\?'([^']*)'/g, '$1');

  // ??"" or ??'' at the very start of a token (after newline/space)
  s = s.replace(/\?\?"[^"]*"/g, '');
  s = s.replace(/\?\?'[^']*'/g, '');

  return s;
}

function patchFile(fpath) {
  let src;
  try {
    // Ensure writable first
    try { fs.chmodSync(fpath, 0o644); } catch (_) {}
    src = fs.readFileSync(fpath, 'utf8');
  } catch (_) { return; }

  if (!src.includes('??')) return;

  const fixed = directFix(src);
  if (fixed === src) return;

  try {
    fs.writeFileSync(fpath, fixed, 'utf8');
    // Make read-only so patcher can't re-inject
    try { fs.chmodSync(fpath, 0o444); } catch (_) {}
    process.stderr.write('[preload-fix] ✅ patched ' + path.basename(fpath) + '\n');
  } catch (e) {
    process.stderr.write('[preload-fix] ⚠️ write failed ' + path.basename(fpath) + ': ' + e.message + '\n');
  }
}

// Patch all chunks immediately at startup
function patchAll() {
  if (!fs.existsSync(CHUNKS_DIR)) return;
  let files;
  try { files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js')); }
  catch (_) { return; }
  files.forEach(f => patchFile(path.join(CHUNKS_DIR, f)));
}

patchAll();

// Also hook Module._compile for any CJS loads that somehow get through
const _origCompile = Module.prototype._compile;
Module.prototype._compile = function _compileFix(content, filename) {
  if (filename && filename.includes('vite/dist/node/') && content.includes('??')) {
    const fixed = directFix(content);
    if (fixed !== content) {
      process.stderr.write('[preload-fix] 🔧 _compile fixed ' + path.basename(filename) + '\n');
      return _origCompile.call(this, fixed, filename);
    }
  }
  return _origCompile.call(this, content, filename);
};

process.stderr.write('[preload-fix] ✅ preload hook installed\n');
