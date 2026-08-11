/**
 * vite-fix-loader.mjs v18
 *
 * NOTE: This loader is no longer registered via module.register() because
 * Atomics.wait on the main thread causes the build to hang on Node 24.
 *
 * The Vite chunk fix is now handled entirely by:
 *  1. _preload.cjs (synchronous disk patch + Module._compile CJS hook)
 *  2. vite.config.cjs rollup plugin (transform hook)
 *
 * This file is kept for backward compatibility but is not loaded.
 */

export function initialize(data) {
  try {
    const sab = data?.sab;
    if (sab instanceof SharedArrayBuffer) {
      const arr = new Int32Array(sab);
      Atomics.store(arr, 0, 1);
      Atomics.notify(arr, 0, Infinity);
    }
  } catch (_) {}
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, context);
}
