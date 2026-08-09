'use strict';
/**
 * build.js — Vercel build wrapper
 *
 * Problem: NODE_OPTIONS=--require ./_preload.cjs with a relative path breaks
 * npm install because postinstall scripts (e.g. @swc/core) run with a
 * different CWD where ./_preload.cjs doesn't exist.
 *
 * Solution:
 *   1. Require _preload.cjs NOW (absolute, from __dirname) to patch Vite chunks
 *      on disk and set up Module._compile / ESM hooks.
 *   2. Spawn `vite build` with NODE_OPTIONS using the ABSOLUTE path to
 *      _preload.cjs — so it works regardless of CWD during the build.
 */
const path      = require('path');
const { spawnSync } = require('child_process');

// ── Step 1: patch existing Vite chunks on disk immediately ─────────────────
process.stderr.write('[build.js] running _preload.cjs (disk patch + hooks)\n');
require('./_preload.cjs');

// ── Step 2: resolve absolute path so NODE_OPTIONS works in any CWD ────────
const preloadAbs = path.resolve(__dirname, '_preload.cjs');

// Clean up any relative _preload refs that might already be in NODE_OPTIONS
const existingOpts = (process.env.NODE_OPTIONS || '')
  .replace(/--require\s+\S*_preload\S*/g, '')
  .trim();

const nodeOpts = `--require ${preloadAbs}${existingOpts ? ' ' + existingOpts : ''}`;
process.stderr.write(`[build.js] vite build  NODE_OPTIONS=${nodeOpts}\n`);

// ── Step 3: spawn vite build ───────────────────────────────────────────────
const isWin = process.platform === 'win32';
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
