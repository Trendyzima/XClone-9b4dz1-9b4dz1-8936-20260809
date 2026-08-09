'use strict';
/**
 * _build.cjs — Vercel build wrapper
 *
 * Uses TWO layers of protection in the child vite process:
 *
 *  1. --require _preload.cjs   — disk patch + CJS _compile hook + file watchers
 *  2. --experimental-loader vite-fix-loader.mjs
 *                              — ESM load hook (loaded SYNCHRONOUSLY before any
 *                                module, unlike Module.register() which is async)
 *
 * The --experimental-loader flag guarantees the hook intercepts every ESM load
 * of a Vite chunk regardless of when the OnSpace patcher re-injects ??.
 */

const path          = require('path');
const { spawnSync } = require('child_process');

// ── Step 1: run preload in THIS process ────────────────────────────────────
process.stderr.write('[_build] running _preload.cjs (disk-patch + CJS hook)\n');
require('./_preload.cjs');

// ── Step 2: build absolute NODE_OPTIONS for the child ─────────────────────
const preloadAbs = path.resolve(__dirname, '_preload.cjs');
const loaderPath = path.resolve(__dirname, 'vite-fix-loader.mjs');
// Construct a file:// URL for --experimental-loader (works on Linux/Mac/Win)
const loaderUrl  = 'file://' + loaderPath.replace(/\\/g, '/');

// Strip any stale options already in NODE_OPTIONS
const existingOpts = (process.env.NODE_OPTIONS || '')
  .replace(/--require\s+\S*_preload\S*/g, '')
  .replace(/--require\s+_preload-fix/g, '')
  .replace(/--experimental-loader\s+\S*/g, '')
  .replace(/--loader\s+\S*/g, '')
  .trim();

const nodeOpts = [
  '--require ' + preloadAbs,
  '--experimental-loader ' + loaderUrl,
  '--max_old_space_size=8192',
  existingOpts,
].filter(Boolean).join(' ');

process.stderr.write('[_build] vite build  NODE_OPTIONS=' + nodeOpts + '\n');

// ── Step 3: run vite build ─────────────────────────────────────────────────
const isWin  = process.platform === 'win32';
const result = spawnSync(
  isWin ? 'npx.cmd' : 'npx',
  ['vite', 'build'],
  {
    stdio : 'inherit',
    shell : false,
    env   : { ...process.env, NODE_OPTIONS: nodeOpts },
  }
);

process.exit(result.status ?? 1);
