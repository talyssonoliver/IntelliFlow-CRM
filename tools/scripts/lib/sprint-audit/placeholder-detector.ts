/**
 * Placeholder Detection Module
 *
 * Scans source code files for placeholder patterns that indicate
 * incomplete implementations (TODO, FIXME, STUB, empty functions, etc.).
 *
 * @module tools/scripts/lib/sprint-audit/placeholder-detector
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import type {
  PlaceholderFinding,
  PlaceholderPattern,
  PlaceholderScanConfig,
  DEFAULT_SCAN_CONFIG,
} from './types';

// =============================================================================
// Placeholder Pattern Definitions
// =============================================================================

/**
 * Regular expression patterns for detecting placeholder code.
 * Each pattern is mapped to a PlaceholderPattern type.
 */
export const PLACEHOLDER_PATTERNS: Record<PlaceholderPattern, RegExp> = {
  // Comment markers indicating incomplete work
  TODO: /\b(TODO|@TODO)\s*[:(.-]/gi,
  FIXME: /\b(FIXME|@FIXME)\s*[:(.-]/gi,
  // Matches the word PLACEHOLDER but NOT when it is used as an HTML/JSX attribute
  // name (e.g., placeholder="hint text" or placeholder={value}).  The negative
  // lookahead (?!\s*=\s*['"`{]) skips any occurrence where the word is immediately
  // followed by '=' and then a quote or brace — which is the HTML/JSX attribute
  // syntax.  JavaScript variable assignments like `const placeholder = value` are
  // NOT excluded because the right-hand side is not a quote or opening brace.
  PLACEHOLDER: /\bPLACEHOLDER(?!\s*=\s*['"`{])/gi,
  STUB: /\bSTUB\b/gi,
  HACK: /\b(HACK|@HACK)\s*[:(.-]/gi,
  XXX: /\bXXX\b/gi,

  // Empty or placeholder implementations
  EMPTY_FUNCTION:
    /(?:function\s+\w+|\w+\s*[:=]\s*(?:async\s+)?function|\w+\s*[:=]\s*(?:async\s+)?\([^)]*\)\s*=>)\s*\{\s*\}/g,
  THROW_NOT_IMPLEMENTED:
    /throw\s+(?:new\s+)?(?:Error|NotImplementedError)\s*\(\s*['"`](?:Not implemented|TODO|FIXME|STUB)/gi,

  // Test placeholders
  SKIP_TEST: /\b(?:it|test|describe)\.skip\s*\(/g,
  EMPTY_TEST:
    /\b(?:it|test)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*(?:async\s+)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/g,
  PENDING_TEST: /\b(?:it|test)\.todo\s*\(/g,

  // Mock returns that may indicate incomplete implementation
  MOCK_RETURN: /return\s+['"`](?:mock|fake|dummy|placeholder|test)[_-]?/gi,

  // Simulated/synthetic data markers (IFC-085: fake benchmark data)
  SIMULATED_DATA: /\b(simulated|mock:.*:v\d|fake[_-]?data|synthetic)\b/gi,

  // Placeholder return values (IFC-157: SMS/Webhook/Push channels)
  PLACEHOLDER_RETURN: /return\s*\{\s*placeholder:\s*true\s*\}/g,

  // Not wired/integrated comments (IFC-099, IFC-117, IFC-144)
  NOT_WIRED_COMMENT: /\/\/\s*(TODO|PLACEHOLDER):\s*(wire|integrate|connect)/gi,

  // Placeholder channel switch cases (IFC-157: notification channels)
  PLACEHOLDER_CHANNEL: /case\s+['"](\w+)['"]\s*:[\s\S]{0,100}placeholder:\s*true/g,

  // Null fallback returns (IFC-020, IFC-155)
  NULL_FALLBACK:
    /\/\/\s*For now,?\s*return\s*null\s*to\s*fallback|return\s*null\s*;?\s*\/\/\s*(placeholder|TODO|fallback)/gi,

  // Hardcoded AI prediction values (IFC-095)
  HARDCODED_PREDICTION:
    /\/\/\s*TODO:\s*Implement\s+with\s+real\s+.*chain|return\s*\{\s*(confidence|score|risk|churnProbability):\s*\d+\.?\d*\s*,/gi,

  // Deferred audit logging (IFC-125)
  DEFERRED_AUDIT: /\/\/\s*TODO:?\s*.*audit\s*log/gi,

  // Placeholder demonstration comments (IFC-128)
  DEMONSTRATION_PLACEHOLDER: /\/\/\s*This\s+is\s+a\s+placeholder\s+for\s+demonstration/gi,

  // Simulated benchmark entries (IFC-150)
  SIMULATED_BENCHMARK: /["']name["']\s*:\s*["'][^"']*\(simulated\)["']/gi,

  // Stubbed token counting (IFC-115)
  STUBBED_TOKEN_COUNT: /\/\/\s*Would\s+need\s+actual\s+token\s+counting/gi,
};

/**
 * Additional context patterns that help identify if a placeholder is in production code
 */
const CONTEXT_EXCLUSIONS = {
  // These paths suggest test/mock files where placeholders are acceptable
  testFilePaths: [
    /__tests__/,
    /\.test\./,
    /\.spec\./,
    /\.mock\./,
    /test-utils/,
    /fixtures/,
    /mocks/,
  ],
  // Comments that indicate intentional placeholder (documented technical debt)
  documentedDebt: [/\/\/\s*@debt/i, /\/\/\s*@technical-debt/i, /\/\*\*?\s*@debt/i],

  // Vitest config files where "Stub" comments are intentional test infrastructure
  // (e.g. "// Stub CSS-only imports", "// Stub temporal polyfill side-effect import")
  vitestConfigPaths: [/(?:^|[/\\])vitest\.config\.[jt]s$/],
};

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Discovers files to scan based on configuration
 */
export async function discoverFiles(
  repoRoot: string,
  config: PlaceholderScanConfig
): Promise<string[]> {
  const { extensions, excludeDirs } = config;

  // Build glob pattern for all extensions
  const extPattern = extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`;

  const pattern = `**/*${extPattern}`;

  const files = await glob(pattern, {
    cwd: repoRoot,
    absolute: true,
    ignore: excludeDirs.map((dir) => `**/${dir}/**`),
    nodir: true,
  });

  // Filter by file size
  const validFiles: string[] = [];
  for (const file of files) {
    try {
      const stats = await fs.promises.stat(file);
      if (stats.size >= config.minFileSize && stats.size <= config.maxFileSize) {
        validFiles.push(file);
      }
    } catch {
      // Skip files we can't stat
    }
  }

  return validFiles;
}

// =============================================================================
// Placeholder Detection
// =============================================================================

/**
 * Scans a single file for placeholder patterns
 */
export async function scanFile(filePath: string, repoRoot: string): Promise<PlaceholderFinding[]> {
  const findings: PlaceholderFinding[] = [];

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(repoRoot, filePath);

    // Check if this is a test file (findings may be less critical)
    const isTestFile = CONTEXT_EXCLUSIONS.testFilePaths.some((pattern) =>
      pattern.test(relativePath)
    );

    // Vitest config files: "// Stub CSS-only imports", "// Stub temporal polyfill …"
    // are intentional test-infrastructure comments, not production stubs.
    const isVitestConfig = CONTEXT_EXCLUSIONS.vitestConfigPaths.some((pattern) =>
      pattern.test(relativePath)
    );

    // Scan each line
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Skip if line is documented technical debt
      const isDocumentedDebt = CONTEXT_EXCLUSIONS.documentedDebt.some((pattern) =>
        pattern.test(line)
      );
      if (isDocumentedDebt) continue;

      // Check each pattern
      for (const [patternName, regex] of Object.entries(PLACEHOLDER_PATTERNS)) {
        // Reset regex state for global patterns
        regex.lastIndex = 0;

        let match;
        while ((match = regex.exec(line)) !== null) {
          // Skip certain patterns in test files
          if (isTestFile && ['SKIP_TEST', 'PENDING_TEST', 'EMPTY_TEST'].includes(patternName)) {
            continue;
          }

          // STUB in vitest config files: lines like "// Stub CSS-only imports that
          // break in test env" and "// Stub temporal polyfill side-effect import"
          // are intentional test-infrastructure configuration, not production stubs.
          if (patternName === 'STUB' && isVitestConfig) {
            continue;
          }

          // For PLACEHOLDER pattern: apply additional line-level exclusions to
          // avoid false positives from legitimate UI / test code.
          if (patternName === 'PLACEHOLDER') {
            // 1. Skip HTML/JSX attribute values: the word "placeholder" that
            //    appears as the *value* inside placeholder="..." or
            //    placeholder={...}. These look like:
            //      placeholder="Enter email"   → value contains "placeholder"
            //      placeholder='Search...'     → value contains "placeholder"
            //    The regex already excludes the attribute *name* via the
            //    negative lookahead (?!\s*=). This guard covers the rarer case
            //    where the string value itself spells out "placeholder".
            //    We detect this by checking if the match is surrounded by
            //    quote characters that are inside a placeholder="..." attribute.
            const isInsideAttributeValue = /\bplaceholder\s*=\s*(['"`{])/.test(
              line.substring(0, match.index + match[0].length)
            );
            if (isInsideAttributeValue) {
              continue;
            }

            // 2. Skip test-description strings that merely mention the word
            //    "placeholder" as human-readable text, e.g.:
            //      it('renders SearchFilterBar with search placeholder text', ...)
            //      describe('placeholder behavior', ...)
            //    These are identified when the line begins a test/describe call
            //    and the match sits inside the opening quoted string argument.
            const isTestDescription =
              /^\s*(?:it|test|describe)\s*(?:\.(?:each|skip|only|todo))?\s*\(/.test(line);
            if (isTestDescription) {
              // Find the start and end of the first string argument.
              const firstQuoteMatch = /\(\s*(['"`])/.exec(line);
              if (firstQuoteMatch) {
                const quoteChar = firstQuoteMatch[1];
                const quoteStart = firstQuoteMatch.index + firstQuoteMatch[0].length - 1;
                // Find closing quote (simple scan — good enough for single-line titles)
                let quoteEnd = line.indexOf(quoteChar, quoteStart + 1);
                if (quoteEnd === -1) quoteEnd = line.length;
                if (match.index >= quoteStart && match.index <= quoteEnd) {
                  continue;
                }
              }
            }

            // 3. Skip Tailwind CSS utility classes used in className/class attributes.
            //    Patterns like `placeholder-slate-400`, `placeholder:text-muted-foreground`,
            //    `placeholder:text-slate-400`, `placeholder:text-slate-500` are valid
            //    Tailwind classes, not placeholder code markers.
            //    Detect: the match is preceded (on the same token) by a hyphen or colon
            //    indicating it is part of a CSS utility class name, AND the line contains
            //    a JSX/HTML class attribute.
            const isTailwindClass =
              /\bplaceholder[-:]/.test(line.substring(Math.max(0, match.index - 1))) &&
              /(?:className|class)\s*[={]/.test(line);
            if (isTailwindClass) {
              continue;
            }

            // 4. Skip CSS-in-JS pseudo-element selectors: '::placeholder': { ... }
            //    This is the Stripe Elements / CSS-in-JS pattern for styling the
            //    native <input> placeholder pseudo-element. It is not a code placeholder.
            const isCssInJsPseudo = /['"]::placeholder['"]/.test(line);
            if (isCssInJsPseudo) {
              continue;
            }

            // 5. Skip React Query / TanStack Query API: placeholderData property.
            //    `placeholderData: ...` is a standard React Query option that provides
            //    stale data while a query is loading — it is not a placeholder marker.
            const isReactQueryOption = /\bplaceholderData\s*:/.test(line);
            if (isReactQueryOption) {
              continue;
            }

            // 6. CSS placeholder classes — Tailwind form-plugin and raw CSS utility
            //    classes that style the browser's native <input> placeholder text.
            //    Examples (in .tsx / .ts / .css files):
            //      placeholder:text-muted-foreground
            //      placeholder-slate-400
            //      placeholder-gray-500
            //      placeholder="Search..."   (HTML attribute value in JSX/TSX)
            //    The `isTailwindClass` guard above (guard #3) already handles the case
            //    where `placeholder[-:]` appears AND a `className`/`class` attribute is
            //    on the same line.  This guard catches the remaining cases where the
            //    line contains a standalone Tailwind placeholder utility OR an HTML
            //    `placeholder=` attribute in a JSX/TSX/CSS file without a className.
            //    guardName: css-placeholder-class
            const isCssPlaceholderClass =
              /\bplaceholder(?::text-|[-](?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black|inherit|current|transparent)\b)/.test(
                line
              );
            if (isCssPlaceholderClass) {
              continue;
            }

            // 7. HTML placeholder prop values in stories and UI component files.
            //    Lines like:
            //      placeholder: 'Search...'
            //      placeholder: 'Enter text'
            //      placeholder="Search contacts"
            //    appearing in .stories.tsx files or general component source files are
            //    legitimate HTML input prop values, not code-quality markers.
            //    guardName: html-placeholder-prop-value
            const isHtmlPlaceholderPropValue =
              /^\s*placeholder\s*:\s*['"`]/.test(line) ||
              /\bplaceholder\s*=\s*['"`][^'"` ]{0,80}['"`]/.test(line);
            if (isHtmlPlaceholderPropValue) {
              continue;
            }

            // 8. vitest.config.ts exclusion comments that mention "placeholder" as
            //    part of documentation about excluded test-file patterns.
            //    guardName: vitest-config-placeholder-comment
            if (isVitestConfig) {
              continue;
            }
          }

          // For XXX pattern: skip occurrences inside URL strings, OData delta tokens,
          // and UUID format comments where "xxx" is a literal format placeholder in a
          // string template, not a code-quality marker.
          //   - $deltatoken=xxx  (Microsoft Graph OData continuation token in test URL)
          //   - xxxxxxxx-xxxx-4xxx-...  (UUID v4 format template)
          //   - // Format: xxxxxxxx-xxxx-...  (UUID format comment)
          if (patternName === 'XXX') {
            // UUID format string: a run of x characters adjacent to hyphens and digits
            // as in 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.
            const isUuidFormatString = /[0-9a-f]*xxx[0-9a-f]*-|[0-9a-f]*xxx[0-9a-f]*'/.test(
              line.substring(Math.max(0, match.index - 8), match.index + match[0].length + 8)
            );
            if (isUuidFormatString) {
              continue;
            }

            // URL / OData token: xxx appears inside a quoted URL string or query parameter
            // e.g. 'https://...?$deltatoken=xxx' or similar token placeholders in URLs.
            const isUrlToken = /https?:\/\/[^\s'"]*xxx|[?&$][a-z]+=xxx/.test(
              line.substring(Math.max(0, match.index - 40), match.index + match[0].length + 10)
            );
            if (isUrlToken) {
              continue;
            }

            // UUID format comment: lines like
            //   // Format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
            //   // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
            const isFormatComment = /\/\/.*\bformat\b.*xxx|\/\/.*uuid.*xxx/i.test(line);
            if (isFormatComment) {
              continue;
            }
          }

          // For SIMULATED_DATA pattern: suppress false positives from test
          // fixtures, synthetic browser events, documented DI fallbacks,
          // benchmark scripts, and storybook files.
          if (patternName === 'SIMULATED_DATA') {
            // 1. Test files: simulated/synthetic/mock data is expected
            //    guardName: simulated-data-in-test
            if (isTestFile) {
              continue;
            }

            // 2. Synthetic browser events (React SyntheticEvent, etc.)
            //    guardName: synthetic-event-construction
            const isSyntheticEvent =
              /\bsynthetic\s*(?:Event|Change|Input|Click|Key|Mouse|Focus|Blur)/i.test(line) ||
              /new\s+Event\b/.test(line) ||
              /\bdispatchEvent\b/.test(line);
            if (isSyntheticEvent) {
              continue;
            }

            // 3. Scripts and tools directories (benchmarks, linters, etc.)
            //    guardName: simulated-in-tooling
            if (/(?:scripts?|tools?|benchmarks?)[/\\]/.test(relativePath)) {
              continue;
            }

            // 4. Storybook files
            //    guardName: simulated-in-storybook
            if (/\.stories\.[jt]sx?$/.test(relativePath)) {
              continue;
            }

            // 5. Documented dev/test/mock fallbacks with intent comments
            //    guardName: simulated-documented-fallback
            const prevLineSim = lineIndex > 0 ? lines[lineIndex - 1] : '';
            const isDocumentedFallback =
              /\/\/.*(?:dev|test|fallback|mock|stub|production|replace|NOTE|MS Graph|sentinel)/i.test(
                line
              ) ||
              /\/\/.*(?:dev|test|fallback|mock|stub|production|replace|NOTE|MS Graph|sentinel)/i.test(
                prevLineSim
              );
            if (isDocumentedFallback) {
              continue;
            }

            // 6. Class/variable names containing "Mock" or "Fake" (naming convention)
            //    guardName: simulated-mock-class-name
            const isMockClassName =
              /\bclass\s+(?:Mock|Fake)\w+/.test(line) || /\b(?:Mock|Fake)\w+\s*[({]/.test(line);
            if (isMockClassName) {
              continue;
            }

            // 7. JSDoc / comment-only lines where "synthetic" or "simulated" is
            //    English documentation, not a code marker.
            //    e.g. `* real API; omit it to fall back to the synthetic dev-mode response.`
            //    guardName: simulated-in-comment
            const isCommentOnly = /^\s*(?:\/\/|\*|\/\*\*)/.test(line);
            if (isCommentOnly) {
              continue;
            }

            // 8. String literals inside Mock-prefixed classes (e.g. 'Mock.Simulated.Threat')
            //    where the match is inside a quoted string, not structural code.
            //    guardName: simulated-in-string-literal
            const isStringLiteral = /['"`].*(?:simulated|synthetic).*['"`]/i.test(line);
            if (isStringLiteral) {
              continue;
            }
          }

          // For TODO pattern: suppress domain status config keys and test skip
          // description strings where "TODO" is content, not a code marker.
          if (patternName === 'TODO') {
            // 1. Domain status enum/config key: `TODO: { label: '...' }`
            //    where TODO is a task-management status value, not a code TODO.
            //    guardName: todo-domain-status-key
            const isDomainStatusKey =
              /^\s*['"]?TODO['"]?\s*:\s*\{/.test(line) || /^\s*TODO\s*:\s*\{/.test(line);
            if (isDomainStatusKey) {
              continue;
            }

            // 2. Test skip descriptions: `it.skip('TODO: implement ...')`
            //    The TODO is in the test name string, not actionable code.
            //    Also catches TODO comments on the line immediately before `it.skip(`.
            //    guardName: todo-in-skip-description
            const nextLine = lineIndex < lines.length - 1 ? lines[lineIndex + 1] : '';
            const isSkipDescription =
              /\b(?:it|test|describe)\.skip\s*\(/.test(line) ||
              /\b(?:it|test|describe)\.skip\s*\(/.test(nextLine);
            if (isSkipDescription) {
              continue;
            }

            // 3. TODO in test-file comments about flaky/timing issues.
            //    Test files often have `// TODO: Flaky test due to ...` which is
            //    documented test debt, not a production code stub.
            //    guardName: todo-in-test-comment
            if (isTestFile && /^\s*\/\//.test(line)) {
              const isTodoTestComment =
                /\/\/\s*TODO:?\s*(?:Flaky|timing|intermittent|skip|re-?enable|investigate)/i.test(
                  line
                );
              if (isTodoTestComment) {
                continue;
              }
            }
          }

          // For MOCK_RETURN pattern: suppress standard test mock return values.
          // Test files returning mock/fake/dummy data is expected behavior.
          if (patternName === 'MOCK_RETURN') {
            if (isTestFile) {
              continue;
            }
          }

          // For STUB pattern: suppress vi.mock() component stubs in test files
          // and documented DI-pattern production code.
          if (patternName === 'STUB') {
            // 1. vi.mock() stubs in test files — matches direct vi.mock lines
            //    AND mock factory return values (JSX component stubs with "stub"
            //    in the display text, e.g. `<div>PaymentMethods stub</div>`).
            //    guardName: vi-mock-stub
            if (isTestFile) {
              const isViMockStub =
                /\bvi\.mock\b/.test(line) ||
                /\bjest\.mock\b/.test(line) ||
                /\bvi\.fn\b/.test(line) ||
                />\w+\s+stub</.test(line) ||
                /['"`]\w+\s+stub['"`]/.test(line);
              if (isViMockStub) {
                continue;
              }
            }

            // 2. Documented DI fallback: "stub" in a comment about production wiring
            //    guardName: stub-documented-di
            const prevLineStub = lineIndex > 0 ? lines[lineIndex - 1] : '';
            const isDocumentedDI =
              /\/\/.*(?:DI|container|production|OutboxEventBus|wired|inject)/i.test(line) ||
              /\/\/.*(?:DI|container|production|OutboxEventBus|wired|inject)/i.test(prevLineStub);
            if (isDocumentedDI) {
              continue;
            }
          }

          // For PLACEHOLDER pattern: additional guards beyond the existing 8.
          if (patternName === 'PLACEHOLDER') {
            // 9. Test variable/class names containing "placeholder" as identifier.
            //    e.g. `const placeholderItems = [...]`, `placeholderZone` CSS class,
            //    or standalone `const placeholder = querySelector(...)`.
            //    guardName: placeholder-as-identifier
            const isPlaceholderIdentifier =
              /\bplaceholder[A-Z]\w*\b/.test(line) ||
              /\b\w+[Pp]laceholder\b/.test(line) ||
              /['"]placeholder-?\w*-?zone['"]/.test(line) ||
              /\b(?:const|let|var)\s+placeholder\b/.test(line);
            if (isPlaceholderIdentifier) {
              continue;
            }

            // 10. Lint/tool scripts where "placeholder" is algorithm/regex content.
            //     guardName: placeholder-in-tooling
            if (/(?:tools?|scripts?|lint)[/\\]/.test(relativePath)) {
              continue;
            }

            // 11. UI test label text mentioning "placeholder" as visible content.
            //     guardName: placeholder-in-test-label
            if (isTestFile) {
              const isTestLabel =
                /(?:getByText|queryByText|findByText|toHaveTextContent|getByRole|getByLabelText)\s*\(/.test(
                  line
                ) ||
                /(?:expect|screen)\s*\(/.test(line) ||
                /['"].*placeholder.*['"]\s*[,)]/.test(line);
              if (isTestLabel) {
                continue;
              }
            }

            // 12. Test-file comments using "placeholder" as English prose.
            //     e.g. `// should show placeholder text, not the full content`
            //     The word describes a UI concept, not a code-quality marker.
            //     guardName: placeholder-in-test-comment
            if (isTestFile && /^\s*\/\//.test(line)) {
              continue;
            }
          }

          // For EMPTY_FUNCTION pattern: suppress well-known false-positive
          // patterns where an empty/no-op arrow function is intentional rather
          // than a forgotten implementation stub.
          if (patternName === 'EMPTY_FUNCTION') {
            // 1. Null-coalescing defensive fallbacks.
            //    `?? (() => {})` is a safe default for an optional callback prop.
            //    `?? { mutateAsync: async () => {} }` is a safe default for an
            //    optional React Query mutation object.
            //    Also catches multi-line patterns where `??` is on the previous line
            //    and the empty function is on the current line (e.g. `?? {\n  mutateAsync: async () => {},`).
            //    Neither is a forgotten implementation — they are intentional guards
            //    against calling undefined.
            //    guardName: null-coalescing-defensive-fallback
            const prevLineNc = lineIndex > 0 ? lines[lineIndex - 1] : '';
            const isNullCoalescingFallback =
              /\?\?\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line) ||
              /\?\?\s*\{\s*mutateAsync\s*:\s*async\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(line) ||
              /\?\?\s*\{?\s*$/.test(prevLineNc);
            if (isNullCoalescingFallback) {
              continue;
            }

            // 2. Menu-separator no-op click handlers.
            //    Menu separator items use `{ separator: true, onClick: () => {} }`.
            //    The empty onClick is intentional — separators are not clickable
            //    UI elements and the handler is required only by the type contract.
            //    guardName: menu-separator-noop-onclick
            const isMenuSeparatorNoop =
              /\bseparator\s*:\s*true\b/.test(line) &&
              /onClick\s*:\s*\(\s*\)\s*=>\s*\{\s*\}/.test(line);
            if (isMenuSeparatorNoop) {
              continue;
            }

            // 3. Fire-and-forget `.catch(() => {})` anywhere on a line.
            //    Notification dispatches, analytics pings, audio.play(), and
            //    other side-effect calls intentionally swallow errors so the
            //    calling code path is not interrupted.  Not unfinished stubs.
            //    guardName: fire-and-forget-catch
            const isFireAndForgetCatch =
              /\.catch\s*\(\s*(?:async\s+)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line);
            if (isFireAndForgetCatch) {
              continue;
            }

            // 4. Test mock setup patterns in test files.
            //    Several boilerplate patterns inside `__tests__/` and `.test.ts`
            //    files generate EMPTY_FUNCTION false positives:
            //      - `clearDomainEvents: () => {}`  — domain-event test helper
            //      - `vi.fn()` and `vi.fn().mockImplementation(() => {})` — vitest mocks
            //      - `() => <div ...` — component stubs (JSX return, not empty body)
            //    These are all expected, test-infrastructure boilerplate.
            //    guardName: test-mock-setup-boilerplate
            if (isTestFile) {
              const isTestMockBoilerplate =
                /\bclearDomainEvents\s*:\s*\(\s*\)\s*=>\s*\{\s*\}/.test(line) ||
                /\bvi\.fn\s*\(\s*\)/.test(line) ||
                /\bvi\.fn\s*\(\s*\)\s*\.mockImplementation\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(
                  line
                ) ||
                /\(\s*\)\s*=>\s*<[A-Za-z]/.test(line);
              if (isTestMockBoilerplate) {
                continue;
              }
            }

            // 5. Explicitly commented no-op / read-only / intentional callbacks.
            //    When the current line (or the immediately preceding line) contains
            //    a comment that says "No-op", "no-op", "Defensive fallback",
            //    "read-only", "intentional", or "Intentional", the empty arrow
            //    function is documented as deliberate.
            //    guardName: commented-noop-intentional
            const prevLine = lineIndex > 0 ? lines[lineIndex - 1] : '';
            const isCommentedNoop =
              /\/\/\s*(?:No-op|no-op|Defensive fallback|read-only|Read-only|intentional|Intentional|Swallow|swallow|Silent fail|silent fail)/i.test(
                line
              ) ||
              /\/\/\s*(?:No-op|no-op|Defensive fallback|read-only|Read-only|intentional|Intentional|Swallow|swallow|Silent fail|silent fail)/i.test(
                prevLine
              );
            if (isCommentedNoop) {
              continue;
            }

            // 6. vi.spyOn() mock implementations in test files.
            //    `vi.spyOn(console, 'warn').mockImplementation(() => {})`
            //    `vi.spyOn(obj, 'method').mockReturnValue(() => {})`
            //    Standard Vitest patterns for suppressing/capturing output.
            //    guardName: spy-mock-implementation
            if (isTestFile) {
              const isSpyMockImpl =
                /\.mockImplementation\s*\(\s*(?:async\s+)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line);
              if (isSpyMockImpl) {
                continue;
              }
            }

            // 7. React event handler callback props in test renders.
            //    `onChange={() => {}}`, `onRetry={() => {}}`, `onFeedback={() => {}}`
            //    Required props for controlled components in test fixtures.
            //    guardName: test-event-handler-prop
            if (isTestFile) {
              const isTestEventHandlerProp =
                /\bon[A-Z]\w*\s*[:=]\s*\{?\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}?/.test(line);
              if (isTestEventHandlerProp) {
                continue;
              }
            }

            // 8. react-hook-form handleSubmit no-op in test harnesses.
            //    `form.handleSubmit(() => {})` is standard for testing
            //    form validation without a real submit handler.
            //    guardName: form-handleSubmit-noop
            if (isTestFile) {
              const isFormHandleSubmit = /\bhandleSubmit\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(
                line
              );
              if (isFormHandleSubmit) {
                continue;
              }
            }

            // 9. Explicitly named noop variables / callbacks.
            //    `const noop = useCallback(() => {}, [])` or `const noop = () => {}`
            //    Named to signal "no operation" — not stubs.
            //    guardName: named-noop-variable
            const isNamedNoop = /\b(?:const|let|var)\s+no[_-]?[Oo]p\b/i.test(line);
            if (isNamedNoop) {
              continue;
            }

            // 10. Storybook story files where empty functions are default args.
            //     `.stories.tsx` files use `args: { onClick: () => {} }`.
            //     guardName: storybook-noop-arg
            const isStorybookFile = /\.stories\.[jt]sx?$/.test(relativePath);
            if (isStorybookFile) {
              continue;
            }

            // 11. Empty beforeEach/afterEach with only comments (delegation).
            //     `beforeEach(() => { // Reset handled by setup.ts })` in test files.
            //     guardName: empty-lifecycle-delegated
            if (isTestFile) {
              const isEmptyLifecycle =
                /\b(?:beforeEach|afterEach|beforeAll|afterAll)\s*\(\s*(?:async\s+)?\(\s*\)\s*=>\s*\{/.test(
                  line
                );
              if (isEmptyLifecycle) {
                continue;
              }
            }
          }

          findings.push({
            file: relativePath,
            line: lineNumber,
            column: match.index + 1,
            pattern: patternName as PlaceholderPattern,
            content: truncateContent(line, match.index, 100),
            linkedTaskId: extractLinkedTaskId(line),
          });
        }
      }
    }

    // Check for multi-line empty functions (more complex pattern)
    const emptyFunctionFindings = detectEmptyFunctions(content, relativePath);
    findings.push(...emptyFunctionFindings);
  } catch (error) {
    // Log but don't fail on individual file errors
    console.warn(`Warning: Could not scan ${filePath}: ${error}`);
  }

  return findings;
}

/**
 * Detects empty functions that span multiple lines
 */
function detectEmptyFunctions(content: string, relativePath: string): PlaceholderFinding[] {
  const findings: PlaceholderFinding[] = [];

  // Pattern for functions with only whitespace/comments in body
  const multiLineEmptyFunction =
    /(?:function\s+(\w+)|(\w+)\s*[:=]\s*(?:async\s+)?function|\([\w\s,]*\)\s*=>)\s*\{[\s\n]*(?:\/\/[^\n]*\n)*[\s\n]*\}/g;

  let match;
  while ((match = multiLineEmptyFunction.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;

    // Check if function body has any real code (not just comments/whitespace)
    const bodyContent = match[0].substring(match[0].indexOf('{') + 1, match[0].lastIndexOf('}'));
    const hasRealCode =
      bodyContent
        .replaceAll(/\/\/[^\n]*/g, '')
        .replaceAll(/\/\*[\s\S]*?\*\//g, '')
        .trim().length > 0;

    if (!hasRealCode) {
      // Apply context-aware guards to multi-line empty functions.
      // These mirror the single-line guards above.
      const contextStart = Math.max(0, match.index - 200);
      const contextEnd = Math.min(content.length, match.index + match[0].length + 100);
      const context = content.substring(contextStart, contextEnd);
      const matchedText = match[0];

      const isTestFileMl = CONTEXT_EXCLUSIONS.testFilePaths.some((p) => p.test(relativePath));
      const isStorybookMl = /\.stories\.[jt]sx?$/.test(relativePath);

      // Guard: null-coalescing fallback `?? { ... () => {} }`
      if (/\?\?\s*\{/.test(context) && context.indexOf('??') < match.index - contextStart) {
        continue;
      }

      // Guard: fire-and-forget `.catch(() => {})`
      if (
        /\.catch\s*\(\s*(?:async\s+)?\(\s*\)\s*=>/.test(matchedText) ||
        /\.catch\s*\(/.test(
          context.substring(
            Math.max(0, match.index - contextStart - 30),
            match.index - contextStart
          )
        )
      ) {
        continue;
      }

      // Guard: commented no-op / intentional / swallow
      if (/\/\/\s*(?:No-op|Defensive|intentional|Swallow|Silent|read-only)/i.test(context)) {
        continue;
      }

      // Guard: test mock patterns
      if (isTestFileMl) {
        if (
          /\.mockImplementation\s*\(/.test(context) ||
          /\bclearDomainEvents\s*:/.test(context) ||
          /\bvi\.fn\b/.test(context) ||
          /\bon[A-Z]\w*\s*[:=]/.test(context) ||
          /\bhandleSubmit\s*\(/.test(context) ||
          /\b(?:beforeEach|afterEach|beforeAll|afterAll)\s*\(/.test(context)
        ) {
          continue;
        }
      }

      // Guard: named noop
      if (/\b(?:const|let|var)\s+no[_-]?[Oo]p\b/i.test(context)) {
        continue;
      }

      // Guard: storybook file
      if (isStorybookMl) {
        continue;
      }

      // Guard: separator no-op onClick handlers (menu items)
      if (/\bseparator\s*:\s*true\b/.test(context) && /onClick\s*:/.test(context)) {
        continue;
      }

      // Guard: defensive fallback comment on nearby line
      if (/\/\/\s*(?:Defensive|Separator|Required by type)/i.test(context)) {
        continue;
      }

      findings.push({
        file: relativePath,
        line: lineNumber,
        column: 1,
        pattern: 'EMPTY_FUNCTION',
        content: truncateContent(match[0], 0, 100),
        linkedTaskId: null,
      });
    }
  }

  return findings;
}

/**
 * Truncates content for display, centered around the match position
 */
function truncateContent(line: string, matchIndex: number, maxLength: number): string {
  const trimmed = line.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const start = Math.max(0, matchIndex - Math.floor(maxLength / 2));
  const end = Math.min(trimmed.length, start + maxLength);
  const truncated = trimmed.substring(start, end);

  return (start > 0 ? '...' : '') + truncated + (end < trimmed.length ? '...' : '');
}

/**
 * Attempts to extract a linked task ID from comment (e.g., "TODO(IFC-123): ...")
 */
function extractLinkedTaskId(line: string): string | null {
  // Match patterns like:
  // TODO(IFC-123), FIXME(ENV-001-AI), TODO: IFC-001, etc.
  const patterns = [
    /(?:TODO|FIXME|STUB|HACK)\s*\(\s*([A-Z]+-\d+(?:-[A-Z]+)?)\s*\)/i,
    /(?:TODO|FIXME|STUB|HACK)\s*:\s*\[?([A-Z]+-\d+(?:-[A-Z]+)?)\]?/i,
    /\b([A-Z]+-\d+(?:-[A-Z]+)?)\b.*(?:TODO|FIXME|STUB|HACK)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// =============================================================================
// Main Scanner
// =============================================================================

/**
 * Scans multiple files for placeholder patterns
 *
 * @param files - Array of file paths to scan
 * @param repoRoot - Repository root for relative paths
 * @returns Array of placeholder findings
 */
export async function scanForPlaceholders(
  files: string[],
  repoRoot: string
): Promise<PlaceholderFinding[]> {
  const allFindings: PlaceholderFinding[] = [];

  // Process files in batches for performance
  const batchSize = 50;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((file) => scanFile(file, repoRoot)));
    allFindings.push(...batchResults.flat());
  }

  return allFindings;
}

/**
 * Full placeholder scan with file discovery
 *
 * @param repoRoot - Repository root directory
 * @param config - Scan configuration
 * @returns Array of placeholder findings
 */
export async function runPlaceholderScan(
  repoRoot: string,
  config: PlaceholderScanConfig
): Promise<PlaceholderFinding[]> {
  console.log(`Scanning for placeholders in ${repoRoot}...`);

  const files = await discoverFiles(repoRoot, config);
  console.log(`Found ${files.length} files to scan`);

  const findings = await scanForPlaceholders(files, repoRoot);
  console.log(`Found ${findings.length} placeholder(s)`);

  return findings;
}

/**
 * Filters findings to only those related to specific task artifacts
 */
export function filterFindingsByTaskArtifacts(
  findings: PlaceholderFinding[],
  artifactPaths: string[]
): PlaceholderFinding[] {
  // Normalize artifact paths for comparison
  const normalizedArtifacts = artifactPaths.map((p) => p.replaceAll(/\\/g, '/').toLowerCase());

  return findings.filter((finding) => {
    const normalizedFile = finding.file.replaceAll(/\\/g, '/').toLowerCase();
    return normalizedArtifacts.some(
      (artifact) =>
        normalizedFile.includes(artifact) ||
        artifact.includes(normalizedFile) ||
        // Handle glob patterns in artifacts
        (artifact.includes('*') && matchesGlobPattern(normalizedFile, artifact))
    );
  });
}

/**
 * Simple glob pattern matching (supports * and **)
 */
function matchesGlobPattern(filePath: string, pattern: string): boolean {
  const regexPattern = pattern
    .replaceAll(/\*\*/g, '<<<DOUBLESTAR>>>')
    .replaceAll(/\*/g, '[^/]*')
    .replaceAll(/<<<DOUBLESTAR>>>/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

// =============================================================================
// Summary Helpers
// =============================================================================

/**
 * Groups findings by pattern type
 */
export function groupByPattern(
  findings: PlaceholderFinding[]
): Map<PlaceholderPattern, PlaceholderFinding[]> {
  const grouped = new Map<PlaceholderPattern, PlaceholderFinding[]>();

  for (const finding of findings) {
    const existing = grouped.get(finding.pattern) || [];
    existing.push(finding);
    grouped.set(finding.pattern, existing);
  }

  return grouped;
}

/**
 * Groups findings by file
 */
export function groupByFile(findings: PlaceholderFinding[]): Map<string, PlaceholderFinding[]> {
  const grouped = new Map<string, PlaceholderFinding[]>();

  for (const finding of findings) {
    const existing = grouped.get(finding.file) || [];
    existing.push(finding);
    grouped.set(finding.file, existing);
  }

  return grouped;
}

/**
 * Generates a summary of placeholder findings
 */
export function generatePlaceholderSummary(findings: PlaceholderFinding[]): {
  total: number;
  byPattern: Record<string, number>;
  byFile: Record<string, number>;
  criticalCount: number;
} {
  const byPattern: Record<string, number> = {};
  const byFile: Record<string, number> = {};
  let criticalCount = 0;

  // Critical patterns that should block completion
  const criticalPatterns: PlaceholderPattern[] = [
    'THROW_NOT_IMPLEMENTED',
    'EMPTY_FUNCTION',
    'PLACEHOLDER',
    'STUB',
  ];

  for (const finding of findings) {
    byPattern[finding.pattern] = (byPattern[finding.pattern] || 0) + 1;
    byFile[finding.file] = (byFile[finding.file] || 0) + 1;

    if (criticalPatterns.includes(finding.pattern)) {
      criticalCount++;
    }
  }

  return {
    total: findings.length,
    byPattern,
    byFile,
    criticalCount,
  };
}
