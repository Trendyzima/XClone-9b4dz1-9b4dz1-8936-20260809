/**
 * vite-fix-loader.mjs  v3
 *
 * Node.js ESM load hook — registered via module.register() in vite.config.cjs.
 *
 * KEY CHANGE over v2:
 *   We no longer call nextLoad() for Vite's own chunk files.  Instead we read
 *   the file directly with readFileSync() and return the fixed source with
 *   shortCircuit:true.  This eliminates the race window between hook
 *   registration and the first ESM compilation of dep-*.js:
 *
 *   v2 problem:  nextLoad() → default loader → reads disk → returns raw bytes
 *                → hook patches → ok … but module.register() is async so the
 *                hook thread may not be ready yet when the first import fires.
 *
 *   v3 solution: we never touch nextLoad for vite chunks, so Node.js compiles
 *                exactly what WE return — always the cleaned source.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Blanket regex: \w+??["'..."] → \w+
// Catches corruption in function definitions AND call sites.
const CORRUPT_RE = /\b(\w+)\s*\?\?\s*["'][^"']*["']/g;

export async function load(url, context, nextLoad) {

  // ── Fast pass: only intercept Vite's own node-layer chunk files ────────
  if (
    !url.startsWith('file:') ||
    !url.includes('/vite/dist/node/')
  ) {
    return nextLoad(url, context);
  }

  // ── Read the file directly so we own the source ────────────────────────
  let source;
  try {
    source = readFileSync(fileURLToPath(url), 'utf8');
  } catch (e) {
    // Can't read — fall back to normal loading (will still error if corrupted,
    // but at least we didn't hide a different I/O problem)
    process.stderr.write(
      '[vite-fix-loader] ⚠️  readFileSync failed for ' +
      url.split('/').pop() + ': ' + e.message + '\n'
    );
    return nextLoad(url, context);
  }

  // ── Apply corruption fix if needed ─────────────────────────────────────
  let fixed = source;

  if (source.includes('??')) {
    // Blanket fix
    fixed = fixed.replace(CORRUPT_RE, '$1');

    // Belt-and-suspenders for the known replaceDefine variants
    if (fixed.includes('replaceDefine(code??')) {
      fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
      fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
      fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
      fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
      fixed = fixed.replace(
        /replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g,
        'replaceDefine(code, '
      );
    }

    if (fixed !== source) {
      process.stderr.write(
        '[vite-fix-loader] ✅ patched ?? corruption in ' +
        url.split('/').pop() + '\n'
      );
    }
  }

  // ── Return our (possibly-fixed) source, bypassing the rest of the chain ─
  // format:'module' is correct — Vite's dist/node chunks are ESM
  // (confirmed by the error appearing at compileSourceTextModule).
  return {
    shortCircuit: true,
    format: 'module',
    source: fixed,
  };
}
