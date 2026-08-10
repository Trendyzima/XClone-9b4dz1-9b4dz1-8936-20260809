'use strict';

const { spawnSync } = require('child_process');

console.error('[_build] Starting Vite production build...');

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'build'],
  {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      NODE_OPTIONS: '--max_old_space_size=8192'
    }
  }
);

if (result.error) {
  console.error(
    '[_build] ❌ Failed to start Vite:',
    result.error.message
  );
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `[_build] ❌ Vite build failed with exit code ${result.status}`
  );
  process.exit(result.status ?? 1);
}

console.error('[_build] ✅ Vite build completed successfully.');
