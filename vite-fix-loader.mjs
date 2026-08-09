/**
 * vite-fix-loader.mjs  v4
 *
 * Node.js ESM load hook — registered via module.register() in vite.config.cjs.
 *
 * KEY CHANGE over v3:
 *   Extended CORRUPT_RE to also handle  identifier(args)??"string"  patterns.
 *   The OnSpace patcher now inserts ??"" after function-call *results* too,
 *   e.g.  toJSON()??"" {  which makes the subsequent { unexpected.
 *
 *   Old pattern only matched:  identifier??"string"
 *   New pattern also matches:  identifier()??"string"
 *                              identifier(arg1,arg2)??"string"
 *
 *   We intentionally removed \s* around ?? so we only strip patcher-injected
 *   tight ?? (no spaces) and leave legitimate  value ?? "default"  untouched.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Matches patcher-injected ?? corruption (tight — no spaces around ??):
//   identifier??"string"           →  identifier
//   identifier()??"string"         →  identifier()
//   identifier(a, b)??"string"     →  identifier(a, b)
// The (?:\([^)]*\))* part handles zero-or-more simple (non-nested) arg lists.
const CORRUPT_RE = /\b(\w+(?:\([^)]*\))*)\?\?["'][^"']*["']/g;

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
