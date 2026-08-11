'use strict';
/**
 * _patch-vite.cjs
 * Runs immediately after `npm install` (from vercel.json installCommand).
 * Surgically removes the broken `code??""` / `code??''` patterns from
 * Vite's bundled chunks so Node 24's ESM loader doesn't choke on them.
 *
 * Only the exact broken patterns are touched — nothing else.
 */

const fs   = require('fs');
const path = require('path');

const CHUNKS_DIR = path.join(
  __dirname, 'node_modules', 'vite', 'dist', 'node', 'chunks'
);

function applyFix(s) {
  if (!s.includes('code??')) return s;
  let o = s;
  o = o.split('code??"", ').join('code, ');
  o = o.split("code??'', ").join('code, ');
  o = o.split('code??"",').join('code,');
  o = o.split("code??'',").join('code,');
  o = o.split('code??""').join('code');
  o = o.split("code??''").join('code');
  return o;
}

if (!fs.existsSync(CHUNKS_DIR)) {
  console.log('[patch-vite] chunks dir not found — skipping');
  process.exit(0);
}

const files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js'));
let fixed = 0;

for (const f of files) {
  const fp = path.join(CHUNKS_DIR, f);
  try {
    // Make writable
    try { fs.chmodSync(fp, 0o644); } catch (_) {}
    const src = fs.readFileSync(fp, 'utf8');
    if (!src.includes('code??')) {
      try { fs.chmodSync(fp, 0o444); } catch (_) {}
      continue;
    }
    const out = applyFix(src);
    if (out === src) {
      try { fs.chmodSync(fp, 0o444); } catch (_) {}
      continue;
    }
    fs.writeFileSync(fp, out, 'utf8');
    try { fs.chmodSync(fp, 0o444); } catch (_) {}
    console.log('[patch-vite] ✅ fixed ' + f);
    fixed++;
  } catch (e) {
    console.error('[patch-vite] ⚠️ error on ' + f + ': ' + e.message);
  }
}

console.log('[patch-vite] done — ' + fixed + ' file(s) patched');
