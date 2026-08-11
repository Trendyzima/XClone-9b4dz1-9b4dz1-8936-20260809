'use strict';

/**
 * _build.cjs
 *
 * Vercel/Vite build wrapper — simplified for Node 24 compatibility.
 *
 * The Vite corruption workaround is handled entirely by _preload.cjs
 * (synchronous disk patch + CJS hook, no persistent async callbacks).
 *
 * We do NOT use --experimental-loader because:
 *  1. module.register() uses Atomics.wait on the main thread which hangs
 *     the build on Node 24 in Vercel's environment.
 *  2. The CJS hook in _preload.cjs covers all Vite internal chunk loads.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const preloadPath = path.resolve(__dirname, '_preload.cjs');

function cleanNodeOptions(value = '') {
  return value
    .replace(/--require\s+(?:"[^"]*"|'[^']*'|\S*_preload\S*)/g, '')
    .replace(/--loader\s+(?:"[^"]*"|'[^']*'|\S+)/g, '')
    .replace(/--experimental-loader\s+(?:"[^"]*"|'[^']*'|\S+)/g, '')
    .replace(/--max_old_space_size[=\s]+\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const existingNodeOptions = cleanNodeOptions(process.env.NODE_OPTIONS || '');

const nodeOptions = [
  '--require',
  preloadPath,
  '--max_old_space_size=8192',
  existingNodeOptions,
]
  .filter(Boolean)
  .join(' ');

process.stderr.write('\n[_build] ========================================\n');
process.stderr.write('[_build] Starting Vite production build\n');
process.stderr.write('[_build] Node: ' + process.version + '\n');
process.stderr.write('[_build] Platform: ' + process.platform + '\n');
process.stderr.write('[_build] NODE_OPTIONS: ' + nodeOptions + '\n');
process.stderr.write('[_build] ========================================\n\n');

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(
  command,
  ['vite', 'build'],
  {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
  }
);

if (result.error) {
  process.stderr.write('\n[_build] ❌ Could not start Vite:\n' + result.error.message + '\n');
  process.exit(1);
}

if (result.signal) {
  process.stderr.write('\n[_build] ❌ Vite terminated by signal: ' + result.signal + '\n');
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write('\n[_build] ❌ Vite build failed with exit code: ' + result.status + '\n');
  process.exit(result.status || 1);
}

process.stderr.write('\n[_build] ✅ Vite build completed successfully.\n');
process.exit(0);
