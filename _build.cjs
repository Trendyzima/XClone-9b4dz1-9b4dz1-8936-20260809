'use strict';

/**
 * _build.cjs — Vercel build wrapper
 *
 * Runs Vite with:
 *
 *  1. --require _preload.cjs
 *     — disk patch + CJS hook + watcher
 *
 *  2. --experimental-loader vite-fix-loader.mjs
 *     — ESM hook for Vite chunks
 *
 * The actual ?? repair logic remains inside _preload.cjs
 * and vite-fix-loader.mjs.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const preloadAbs = path.resolve(__dirname, '_preload.cjs');
const loaderPath = path.resolve(__dirname, 'vite-fix-loader.mjs');

const loaderUrl = 'file://' + loaderPath.replace(/\\/g, '/');

// Remove any previously injected versions of our options.
const existingOpts = (process.env.NODE_OPTIONS || '')
  .replace(/--require\s+\S*_preload\S*/g, '')
  .replace(/--require\s+_preload-fix/g, '')
  .replace(/--experimental-loader\s+\S*/g, '')
  .replace(/--loader\s+\S*/g, '')
  .replace(/--max_old_space_size=\S+/g, '')
  .trim();

const nodeOpts = [
  '--require',
  preloadAbs,
  '--experimental-loader',
  loaderUrl,
  '--max_old_space_size=8192',
  existingOpts,
]
  .filter(Boolean)
  .join(' ');

process.stderr.write(
  '[_build] Starting Vite build...\n'
);

process.stderr.write(
  '[_build] NODE_OPTIONS=' + nodeOpts + '\n'
);

const isWin = process.platform === 'win32';

const result = spawnSync(
  isWin ? 'npx.cmd' : 'npx',
  ['vite', 'build'],
  {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOpts,
    },
  }
);

if (result.error) {
  process.stderr.write(
    '[_build] ❌ Failed to start Vite: ' +
    result.error.message +
    '\n'
  );

  process.exit(1);
}

process.exit(result.status ?? 1);
