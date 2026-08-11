'use strict';

/**
 * _build.cjs v2 — Vercel build wrapper (Node 24 compatible)
 *
 * The Vite `code??""` corruption is fixed in two layers:
 *   1. installCommand in vercel.json patches chunks on disk before build starts
 *   2. _preload.cjs (loaded via --require) catches any remaining CJS loads
 *
 * NO --experimental-loader (Atomics.wait hangs Node 24 main thread).
 * NO --import (async ESM hooks conflict with CJS require chain).
 */

const path        = require('node:path');
const { spawnSync } = require('node:child_process');

const preloadPath = path.resolve(__dirname, '_preload.cjs');

// Strip any stale preload/loader flags injected by the platform
function cleanNodeOptions(v) {
  return (v || '')
    .replace(/--require\s+\S*_preload\S*/g, '')
    .replace(/--loader\s+\S+/g, '')
    .replace(/--experimental-loader\s+\S+/g, '')
    .replace(/--max_old_space_size[=\s]+\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const nodeOptions = [
  '--require', preloadPath,
  '--max_old_space_size=8192',
  cleanNodeOptions(process.env.NODE_OPTIONS),
].filter(Boolean).join(' ');

process.stderr.write('\n[_build] ========================================\n');
process.stderr.write('[_build] Starting Vite production build\n');
process.stderr.write('[_build] Node: '     + process.version  + '\n');
process.stderr.write('[_build] Platform: ' + process.platform + '\n');
process.stderr.write('[_build] NODE_OPTIONS: ' + nodeOptions  + '\n');
process.stderr.write('[_build] ========================================\n\n');

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'build'],
  {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  }
);

if (result.error) {
  process.stderr.write('\n[_build] ❌ Could not start Vite: ' + result.error.message + '\n');
  process.exit(1);
}
if (result.signal) {
  process.stderr.write('\n[_build] ❌ Vite killed by signal: ' + result.signal + '\n');
  process.exit(1);
}
if (result.status !== 0) {
  process.stderr.write('\n[_build] ❌ Vite build failed (exit ' + result.status + ')\n');
  process.exit(result.status || 1);
}

process.stderr.write('\n[_build] ✅ Vite build completed successfully.\n');
