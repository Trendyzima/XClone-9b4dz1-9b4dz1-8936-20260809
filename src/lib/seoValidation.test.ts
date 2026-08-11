import { validateSEOCoverage, SEO_COVERAGE, scoreSEORoute } from './seoValidation';

// ── ANSI colour helpers ───────────────────────────────────────────────────────
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── Test runner ───────────────────────────────────────────────────────────────
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function test(name: string, assertion: () => { passed: boolean; message: string }) {
  try {
    const result = assertion();
    results.push({ name, ...result });
  } catch (err: any) {
    results.push({ name, passed: false, message: `Threw: ${err.message}` });
  }
}

// ── Run assertions ────────────────────────────────────────────────────────────
const summary = validateSEOCoverage();

// 1. Overall score >= 70%
test('SEO coverage score >= 70%', () => {
  const passed = summary.score >= 70;
  return {
    passed,
    message: passed
      ? `Score is ${summary.score}% (${summary.good} good, ${summary.warn} warn, ${summary.missing} missing, ${summary.noindex} noindex)`
      : `Score is only ${summary.score}% — need ≥70%. Fix these routes:\n${summary.missingRoutes.map(r => `  ${r.path}`).join('\n')}`,
  };
});

// 2. No Dynamic routes without useSEO
test('All Dynamic routes have useSEO', () => {
  const dynamicMissing = SEO_COVERAGE.filter(r => r.group === 'Dynamic' && !r.hasUseSEO);
  return {
    passed: dynamicMissing.length === 0,
    message: dynamicMissing.length === 0
      ? 'All Dynamic routes implement useSEO()'
      : `${dynamicMissing.length} Dynamic routes missing useSEO:\n${dynamicMissing.map(r => `  ${r.path}`).join('\n')}`,
  };
});

// 3. All Dynamic routes have structured data
test('All Dynamic routes have structured data (JSON-LD)', () => {
  const dynamicNoLD = SEO_COVERAGE.filter(r => r.group === 'Dynamic' && !r.hasStructuredData);
  return {
    passed: dynamicNoLD.length === 0,
    message: dynamicNoLD.length === 0
      ? 'All Dynamic routes have JSON-LD structured data'
      : `${dynamicNoLD.length} Dynamic routes missing JSON-LD:\n${dynamicNoLD.map(r => `  ${r.path}`).join('\n')}`,
  };
});

// 4. No public routes entirely missing (score check variant)
test('Zero public routes completely missing SEO (status=missing)', () => {
  const missing = summary.missingRoutes.filter(r => !r.noindex);
  return {
    passed: missing.length === 0,
    message: missing.length === 0
      ? 'No public routes are completely missing SEO'
      : `${missing.length} public routes have no useSEO at all:\n${missing.map(r => `  ${r.path} (${r.group})`).join('\n')}`,
  };
});

// 5. All Admin + Private routes are noindex
test('All Admin and Private routes marked noindex', () => {
  const notNoindex = SEO_COVERAGE.filter(
    r => (r.group === 'Admin' || r.group === 'Private') && !r.noindex
  );
  return {
    passed: notNoindex.length === 0,
    message: notNoindex.length === 0
      ? 'All Admin/Private routes correctly marked noindex'
      : `${notNoindex.length} admin/private routes are NOT marked noindex:\n${notNoindex.map(r => `  ${r.path}`).join('\n')}`,
  };
});

// 6. Core public pages should at least have useSEO (warn, not fail)
test('Core public pages have useSEO (advisory)', () => {
  const coreNoSEO = SEO_COVERAGE.filter(r => r.group === 'Core' && !r.hasUseSEO && !r.noindex);
  return {
    passed: coreNoSEO.length < 5, // allow up to 4 stragglers before failing
    message: coreNoSEO.length === 0
      ? 'All Core public pages have useSEO()'
      : `${coreNoSEO.length} Core pages still missing useSEO (advisory): ${coreNoSEO.map(r => r.path).join(', ')}`,
  };
});

// ── Print results ─────────────────────────────────────────────────────────────
console.log('\n' + bold('─── SEO Coverage CI Validation ───────────────────────────────'));
console.log(dim(`  Total routes tracked: ${SEO_COVERAGE.length} | Score: ${summary.score}%\n`));

let passed = 0;
let failed = 0;

for (const r of results) {
  if (r.passed) {
    console.log(`  ${green('✓')} ${r.name}`);
    console.log(dim(`      ${r.message}`));
    passed++;
  } else {
    console.log(`  ${red('✗')} ${r.name}`);
    console.log(yellow(`      ${r.message.split('\n').join('\n      ')}`));
    failed++;
  }
}

console.log(`\n${bold('─── Summary ──────────────────────────────────────────────────')}`);
console.log(`  ${green(`${passed} passed`)}  ${failed > 0 ? red(`${failed} failed`) : dim('0 failed')}`);

if (failed > 0) {
  console.log(red(`\n  CI gate failed. Fix ${failed} test(s) before merging.\n`));
  process.exit(1);
} else {
  console.log(green('\n  All SEO validation checks passed.\n'));
  process.exit(0);
}
