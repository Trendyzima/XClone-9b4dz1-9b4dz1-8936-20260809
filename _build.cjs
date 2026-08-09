'use strict';
/**
 * _build.cjs — Vercel build wrapper
 *
 * NODE_OPTIONS=--require ./_preload.cjs with a relative path breaks npm
 * install postinstall scripts (different CWD).  This file:
 *   1. Requires _preload.cjs via __dirname (absolute) → patches Vite chunks,
 *      writes + registers the ESM hook, installs the CJS _compile hook.
 *   2. Spawns `vite build` with NODE_OPTIONS using the ABSOLUTE preload path
 *      so the same hooks are active inside the Vite subprocess.
 */

const path          = require('path');
const { spawnSync } = require('child_process');

// ── Step 1: run preload in THIS process ────────────────────────────────────
process.stderr.write('[_build] running _preload.cjs (disk-patch + ESM hook + CJS hook)\n');
require('./_preload.cjs');

// ── Step 2: build absolute NODE_OPTIONS for the child ─────────────────────
const preloadAbs = path.resolve(__dirname, '_preload.cjs');

// Strip any stale relative refs already in NODE_OPTIONS
const existingOpts = (process.env.NODE_OPTIONS || '')
  .replace(/--require\s+\S*_preload\S*/g, '')
  .trim();

const nodeOpts = '--require ' + preloadAbs + (existingOpts ? ' ' + existingOpts : '');
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
