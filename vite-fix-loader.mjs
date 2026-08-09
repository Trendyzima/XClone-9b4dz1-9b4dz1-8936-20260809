/**
 * vite-fix-loader.mjs
 *
 * Node.js ESM module load hook (registered via module.register() in vite.config.cjs).
 * Intercepts Vite's internal dep- chunks BEFORE Node.js compiles them so we can fix
 * the OnSpace patcher bug that puts `??""` into replaceDefine's parameter list —
 * producing a SyntaxError that no disk-based fix can reliably prevent.
 *
 * The hook fires on every dynamic/static import of an ESM file, giving us a window
 * to patch the source text in-memory right before V8 sees it.
 */

const CORRUPTION_MARKER = 'replaceDefine(code??';

export async function load(url, context, nextLoad) {
  // Fetch the raw module source from the next handler (reads disk or uses cache)
  const result = await nextLoad(url, context);

  // Only target Vite's internal dep- chunk files
  if (!url.includes('/vite/dist/node/chunks/dep-')) {
    return result;
  }

  let { source } = result;
  if (source === null || source === undefined) return result;

  // Normalize TypedArray / Buffer → UTF-8 string
  if (typeof source !== 'string') {
    try {
      source = Buffer.from(source).toString('utf8');
    } catch {
      return result; // Can't decode — leave unchanged
    }
  }

  // Fast exit if the corruption isn't present
  if (!source.includes(CORRUPTION_MARKER)) return result;

  // ── Fix all known corruption variants ────────────────────────────────────
  let fixed = source;

  // Variant 1: double-quote, space after comma  → replaceDefine(code??"", id
  fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
  // Variant 2: double-quote, no space           → replaceDefine(code??"",id
  fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
  // Variant 3: single-quote, space              → replaceDefine(code??'', id
  fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
  // Variant 4: single-quote, no space           → replaceDefine(code??'',id
  fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');

  // Regex fallback for any other quoting / whitespace variant
  if (fixed.includes(CORRUPTION_MARKER)) {
    fixed = fixed.replace(
      /replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g,
      'replaceDefine(code, '
    );
  }

  if (fixed !== source) {
    process.stderr.write(
      '[vite-fix-loader] \u2705 patched replaceDefine in ' +
      url.split('/').pop() + '\n'
    );
  }

  return { ...result, source: fixed };
}
