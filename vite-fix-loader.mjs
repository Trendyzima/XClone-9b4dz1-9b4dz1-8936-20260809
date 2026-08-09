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
 *
 * v2: Uses a blanket regex so it catches the patcher's corruption in BOTH
 *   • function call positions:   replaceDefine(code??"", id, ...)
 *   • function def positions:    async function replaceDefine(code??"", id, ...)
 *   • and any other `word??""` / `word??''` patterns the patcher may produce.
 */

export async function load(url, context, nextLoad) {
  // Fetch the raw module source from the next handler (reads disk or uses cache)
  const result = await nextLoad(url, context);

  // Only target Vite's internal dep- chunk files — they must NOT legitimately
  // contain `??` with string literals, so blanket-replacing is safe.
  if (!url.includes('/vite/dist/node/')) {
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

  // Fast exit if no `??` corruption present
  if (!source.includes('??')) return result;

  let fixed = source;

  // ── Blanket fix: \w+??["']...["'] → \w+ ────────────────────────────────
  // Catches the patcher corruption wherever it appears (parameter, call, body).
  // Vite's pre-compiled chunks don't use `??` with string literals legitimately.
  fixed = fixed.replace(/\b(\w+)\s*\?\?\s*["'][^"']*["']/g, '$1');

  // ── Belt-and-suspenders: explicit split/join for known variants ──────────
  if (fixed.includes('replaceDefine(code??')) {
    fixed = fixed.split('replaceDefine(code??"", ').join('replaceDefine(code, ');
    fixed = fixed.split('replaceDefine(code??"",').join('replaceDefine(code,');
    fixed = fixed.split("replaceDefine(code??'', ").join('replaceDefine(code, ');
    fixed = fixed.split("replaceDefine(code??'',").join('replaceDefine(code,');
    // Regex fallback for any other quoting / whitespace variant
    fixed = fixed.replace(/replaceDefine\(code\s*\?\?["'][^"']*["'],\s*/g, 'replaceDefine(code, ');
  }

  if (fixed !== source) {
    process.stderr.write(
      '[vite-fix-loader] \u2705 patched ?? corruption in ' +
      url.split('/').pop() + '\n'
    );
  }

  return { ...result, source: fixed };
}
