'use strict';
/**
 * _build.cjs — Vercel build wrapper (CJS, underscore prefix keeps it out of
 * the esbuild syntax sweep that only processes front-end source files).
 *
 * Why this exists:
 *   NODE_OPTIONS=--require ./_preload.cjs with a RELATIVE path breaks
 *   npm install because postinstall scripts run with a different CWD.
 *
 *   This file:
 *     1. Requires _preload.cjs NOW (absolute, via __dirname) → patches Vite
 *        chunks on disk + installs Module._compile / ESM hooks.
 *     2. Spawns `vite build` with NODE_OPTIONS using the ABSOLUTE path so
 *        the hook stays active regardless of the spawned process's CWD.
 */

const path        = require('path');
const { spawnSync } = require('child_process');

// ── Step 1: patch existing Vite chunks on disk immediately ─────────────────
process.stderr.write('[_build] running _preload.cjs (disk-patch + hooks)\n');
require('./_preload.cjs');

// ── Step 2: compute absolute path so NODE_OPTIONS is CWD-independent ───────
const preloadAbs = path.resolve(__dirname, '_preload.cjs');

// Strip any stale relative _preload refs already in NODE_OPTIONS
const existingOpts = (process.env.NODE_OPTIONS || '')
  .replace(/--require\s+\S*_preload\S*/g, '')
  .trim();

const nodeOpts = `--require ${preloadAbs}${existingOpts ? ' ' + existingOpts : ''}`;
process.stderr.write(`[_build] vite build  NODE_OPTIONS=${nodeOpts}\n`);

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
