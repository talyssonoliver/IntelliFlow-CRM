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
    /(?:function[ \t]+\w{1,100}|\w{1,100}[ \t]*[:=][ \t]*(?:async[ \t]+)?(?:function|\([^)]{0,200}\)[ \t]*=>))[ \t]*\{[ \t]*\}/g,
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
    /\/\/[ \t]*For now,?[ \t]*return[ \t]*null[ \t]*to[ \t]*fallback|return[ \t]*null[ \t]*(?:;[ \t]*)?\/\/[ \t]*(placeholder|TODO|fallback)/gi,

  // Hardcoded AI prediction values (IFC-095)
  HARDCODED_PREDICTION:
    /\/\/[ \t]*TODO:[ \t]*Implement[ \t]+with[ \t]+real[ \t]+[^\n]{0,80}chain|return[ \t]*\{[ \t]*(confidence|score|risk|churnProbability):[ \t]*\d{1,10}\.?\d{0,10}[ \t]*,/gi,

  // Deferred audit logging (IFC-125)
  DEFERRED_AUDIT: /\/\/[ \t]*TODO:?[ \t]*[^\n]{0,80}audit[ \t]*log/gi,

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
// Per-line filter context
// =============================================================================

interface LineFilterContext {
  line: string;
  lineIndex: number;
  lines: string[];
  relativePath: string;
  isTestFile: boolean;
  isVitestConfig: boolean;
}

// =============================================================================
// Per-pattern skip helpers
// =============================================================================

/** Returns true if the SKIP_TEST / PENDING_TEST / EMPTY_TEST finding should be suppressed. */
function shouldSkipTestPattern(patternName: string, isTestFile: boolean): boolean {
  return isTestFile && ['SKIP_TEST', 'PENDING_TEST', 'EMPTY_TEST'].includes(patternName);
}

/** Returns true if STUB in a vitest config should be suppressed. */
function shouldSkipStubInVitestConfig(patternName: string, isVitestConfig: boolean): boolean {
  return patternName === 'STUB' && isVitestConfig;
}

/** Returns true if the PLACEHOLDER match is an HTML/JSX attribute value. */
function isInsidePlaceholderAttributeValue(line: string, matchIndex: number): boolean {
  return /\bplaceholder\s*=\s*(['"`{])/.test(line.substring(0, matchIndex + 'PLACEHOLDER'.length));
}

/** Returns true if the PLACEHOLDER match is inside a test/describe description string. */
function isPlaceholderInTestDescription(line: string, matchIndex: number): boolean {
  const isTestDescription =
    /^[ \t]*(?:it|test|describe)[ \t]*(?:\.(?:each|skip|only|todo)[ \t]*)?\(/.test(line);
  if (!isTestDescription) return false;

  const firstQuoteMatch = /\(\s*(['"`])/.exec(line);
  if (!firstQuoteMatch) return false;

  const quoteChar = firstQuoteMatch[1];
  const quoteStart = firstQuoteMatch.index + firstQuoteMatch[0].length - 1;
  let quoteEnd = line.indexOf(quoteChar, quoteStart + 1);
  if (quoteEnd === -1) quoteEnd = line.length;
  return matchIndex >= quoteStart && matchIndex <= quoteEnd;
}

/** Returns true if the PLACEHOLDER match is a Tailwind CSS utility class. */
function isPlaceholderTailwindClass(line: string, matchIndex: number): boolean {
  return (
    /\bplaceholder[-:]/.test(line.substring(Math.max(0, matchIndex - 1))) &&
    /(?:className|class)\s*[={]/.test(line)
  );
}

/** Returns true if the PLACEHOLDER match is a CSS-in-JS pseudo-element. */
function isPlaceholderCssInJsPseudo(line: string): boolean {
  return /['"]::placeholder['"]/.test(line);
}

/** Returns true if the PLACEHOLDER match is a React Query placeholderData option. */
function isReactQueryPlaceholderData(line: string): boolean {
  return /\bplaceholderData\s*:/.test(line);
}

/** Returns true if the PLACEHOLDER match is a CSS color-named placeholder class. */
function isPlaceholderCssColorClass(line: string): boolean {
  return /\bplaceholder(?::text-|[-](?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black|inherit|current|transparent)\b)/.test(
    line
  );
}

/** Returns true if the PLACEHOLDER match is an HTML prop value string. */
function isPlaceholderHtmlPropValue(line: string): boolean {
  return (
    /^\s*placeholder\s*:\s*['"`]/.test(line) ||
    /\bplaceholder\s*=\s*['"`][^'"` ]{0,80}['"`]/.test(line)
  );
}

/** Returns true if the PLACEHOLDER match is a camelCase/compound identifier. */
function isPlaceholderAsIdentifier(line: string): boolean {
  return (
    /\bplaceholder[A-Z]\w*\b/.test(line) ||
    /\b\w+[Pp]laceholder\b/.test(line) ||
    /['"]placeholder-?\w*-?zone['"]/.test(line) ||
    /\b(?:const|let|var)\s+placeholder\b/.test(line)
  );
}

/** Returns true if the PLACEHOLDER match is in a tooling/scripts directory. */
function isPlaceholderInTooling(relativePath: string): boolean {
  return /(?:tools?|scripts?|lint)[/\\]/.test(relativePath);
}

/** Returns true if the PLACEHOLDER match is a test label query. */
function isPlaceholderInTestLabel(line: string): boolean {
  return (
    /(?:getByText|queryByText|findByText|toHaveTextContent|getByRole|getByLabelText)\s*\(/.test(
      line
    ) ||
    /(?:expect|screen)\s*\(/.test(line) ||
    /['"][^'"]{0,200}placeholder[^'"]{0,200}['"][ \t]*[,)]/.test(line)
  );
}

/**
 * Returns true if a PLACEHOLDER match should be suppressed.
 * Applies all 12 exclusion guards in order.
 */
function shouldSkipPlaceholder(ctx: LineFilterContext, matchIndex: number): boolean {
  const { line, relativePath, isTestFile, isVitestConfig } = ctx;

  if (isInsidePlaceholderAttributeValue(line, matchIndex)) return true;
  if (isPlaceholderInTestDescription(line, matchIndex)) return true;
  if (isPlaceholderTailwindClass(line, matchIndex)) return true;
  if (isPlaceholderCssInJsPseudo(line)) return true;
  if (isReactQueryPlaceholderData(line)) return true;
  if (isPlaceholderCssColorClass(line)) return true;
  if (isPlaceholderHtmlPropValue(line)) return true;
  if (isVitestConfig) return true;
  if (isPlaceholderAsIdentifier(line)) return true;
  if (isPlaceholderInTooling(relativePath)) return true;
  if (isTestFile && isPlaceholderInTestLabel(line)) return true;
  // Test-file comments using "placeholder" as English prose
  if (isTestFile && /^\s*\/\//.test(line)) return true;

  return false;
}

/** Returns true if an XXX match is a UUID format string. */
function isXxxUuidFormatString(line: string, matchIndex: number): boolean {
  const snippet = line.substring(Math.max(0, matchIndex - 8), matchIndex + 'XXX'.length + 8);
  return /[0-9a-f]{0,16}xxx[0-9a-f]{0,16}-|[0-9a-f]{0,16}xxx[0-9a-f]{0,16}'/.test(snippet);
}

/** Returns true if an XXX match is inside a URL/OData token. */
function isXxxUrlToken(line: string, matchIndex: number): boolean {
  const snippet = line.substring(Math.max(0, matchIndex - 40), matchIndex + 'XXX'.length + 10);
  return /https?:\/\/[^\s'"]*xxx|[?&$][a-z]+=xxx/.test(snippet);
}

/** Returns true if an XXX match is in a format comment. */
function isXxxFormatComment(line: string): boolean {
  return /\/\/[^\n]{0,200}\bformat\b[^\n]{0,200}xxx|\/\/[^\n]{0,200}uuid[^\n]{0,200}xxx/i.test(
    line
  );
}

/**
 * Returns true if an XXX match should be suppressed.
 */
function shouldSkipXxx(line: string, matchIndex: number): boolean {
  if (isXxxUuidFormatString(line, matchIndex)) return true;
  if (isXxxUrlToken(line, matchIndex)) return true;
  if (isXxxFormatComment(line)) return true;
  return false;
}

/** Returns true if a SIMULATED_DATA match is a synthetic browser event. */
function isSimulatedDataSyntheticEvent(line: string): boolean {
  return (
    /\bsynthetic\s*(?:Event|Change|Input|Click|Key|Mouse|Focus|Blur)/i.test(line) ||
    /new\s+Event\b/.test(line) ||
    /\bdispatchEvent\b/.test(line)
  );
}

/** Returns true if a SIMULATED_DATA match has a documented dev/test/mock fallback comment. */
function isSimulatedDataDocumentedFallback(line: string, prevLine: string): boolean {
  const pattern =
    /\/\/[^\n]{0,300}(?:dev|test|fallback|mock|stub|production|replace|NOTE|MS Graph|sentinel)/i;
  return pattern.test(line) || pattern.test(prevLine);
}

/** Returns true if a SIMULATED_DATA match is a mock class name pattern. */
function isSimulatedDataMockClassName(line: string): boolean {
  return /\bclass\s+(?:Mock|Fake)\w+/.test(line) || /\b(?:Mock|Fake)\w+\s*[({]/.test(line);
}

/** Returns true if a SIMULATED_DATA match is in a string literal. */
function isSimulatedDataStringLiteral(line: string): boolean {
  return /['"`][^'"`]{0,300}(?:simulated|synthetic)[^'"`]{0,300}['"`]/i.test(line);
}

/**
 * Returns true if a SIMULATED_DATA match should be suppressed.
 */
function shouldSkipSimulatedData(ctx: LineFilterContext): boolean {
  const { line, lineIndex, lines, relativePath, isTestFile } = ctx;
  const prevLine = lineIndex > 0 ? lines[lineIndex - 1] : '';

  if (isTestFile) return true;
  if (isSimulatedDataSyntheticEvent(line)) return true;
  if (/(?:scripts?|tools?|benchmarks?)[/\\]/.test(relativePath)) return true;
  if (/\.stories\.[jt]sx?$/.test(relativePath)) return true;
  if (isSimulatedDataDocumentedFallback(line, prevLine)) return true;
  if (isSimulatedDataMockClassName(line)) return true;
  if (/^\s*(?:\/\/|\*|\/\*\*)/.test(line)) return true;
  if (isSimulatedDataStringLiteral(line)) return true;
  return false;
}

/** Returns true if a TODO match is a domain status config key. */
function isTodoDomainStatusKey(line: string): boolean {
  return /^\s*['"]?TODO['"]?\s*:\s*\{/.test(line) || /^\s*TODO\s*:\s*\{/.test(line);
}

/** Returns true if a TODO match is in a test skip description. */
function isTodoInSkipDescription(line: string, nextLine: string): boolean {
  const skipPattern = /\b(?:it|test|describe)\.skip\s*\(/;
  return skipPattern.test(line) || skipPattern.test(nextLine);
}

/** Returns true if a TODO match is a flaky-test comment in a test file. */
function isTodoFlakytestComment(line: string, isTestFile: boolean): boolean {
  return (
    isTestFile &&
    /^\s*\/\//.test(line) &&
    /\/\/\s*TODO:?\s*(?:Flaky|timing|intermittent|skip|re-?enable|investigate)/i.test(line)
  );
}

/**
 * Returns true if a TODO match should be suppressed.
 */
function shouldSkipTodo(ctx: LineFilterContext): boolean {
  const { line, lineIndex, lines, isTestFile } = ctx;
  const nextLine = lineIndex < lines.length - 1 ? lines[lineIndex + 1] : '';

  if (isTodoDomainStatusKey(line)) return true;
  if (isTodoInSkipDescription(line, nextLine)) return true;
  if (isTodoFlakytestComment(line, isTestFile)) return true;
  return false;
}

/**
 * Returns true if a STUB match should be suppressed.
 */
function shouldSkipStub(ctx: LineFilterContext): boolean {
  const { line, lineIndex, lines, isTestFile } = ctx;
  const prevLine = lineIndex > 0 ? lines[lineIndex - 1] : '';

  // vi.mock/jest.mock stubs in test files
  if (isTestFile) {
    const isViMockStub =
      /\bvi\.mock\b/.test(line) ||
      /\bjest\.mock\b/.test(line) ||
      /\bvi\.fn\b/.test(line) ||
      />\w+\s+stub</.test(line) ||
      /['"`]\w+\s+stub['"`]/.test(line);
    if (isViMockStub) return true;
  }

  // Documented DI fallback
  const diPattern = /\/\/[^\n]{0,300}(?:DI|container|production|OutboxEventBus|wired|inject)/i;
  if (diPattern.test(line) || diPattern.test(prevLine)) return true;

  return false;
}

/** Returns true if an EMPTY_FUNCTION match is a null-coalescing defensive fallback. */
function isEmptyFunctionNullCoalescing(line: string, prevLine: string): boolean {
  return (
    /\?\?\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line) ||
    /\?\?\s*\{\s*mutateAsync\s*:\s*async\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(line) ||
    /\?\?[ \t]*(?:\{[ \t]*)?$/.test(prevLine)
  );
}

/** Returns true if an EMPTY_FUNCTION match is a menu separator no-op onClick. */
function isEmptyFunctionMenuSeparator(line: string): boolean {
  return /\bseparator\s*:\s*true\b/.test(line) && /onClick\s*:\s*\(\s*\)\s*=>\s*\{\s*\}/.test(line);
}

/** Returns true if an EMPTY_FUNCTION match is a fire-and-forget .catch. */
function isEmptyFunctionFireAndForget(line: string): boolean {
  return /\.catch\s*\(\s*(?:async\s+)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line);
}

/** Returns true if an EMPTY_FUNCTION match is test mock boilerplate. */
function isEmptyFunctionTestMockBoilerplate(line: string, isTestFile: boolean): boolean {
  if (!isTestFile) return false;
  return (
    /\bclearDomainEvents\s*:\s*\(\s*\)\s*=>\s*\{\s*\}/.test(line) ||
    /\bvi\.fn\s*\(\s*\)/.test(line) ||
    /\bvi\.fn\s*\(\s*\)\s*\.mockImplementation\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line) ||
    /\(\s*\)\s*=>\s*<[A-Za-z]/.test(line)
  );
}

/** Returns true if an EMPTY_FUNCTION match has a commented no-op/intentional annotation. */
function isEmptyFunctionCommentedNoop(line: string, prevLine: string): boolean {
  const noopPattern =
    /\/\/\s*(?:No-op|no-op|Defensive fallback|read-only|Read-only|intentional|Intentional|Swallow|swallow|Silent fail|silent fail)/i;
  return noopPattern.test(line) || noopPattern.test(prevLine);
}

/** Returns true if an EMPTY_FUNCTION match is a spy mock implementation in a test file. */
function isEmptyFunctionSpyMock(line: string, isTestFile: boolean): boolean {
  return (
    isTestFile && /\.mockImplementation\s*\(\s*(?:async\s+)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line)
  );
}

/** Returns true if an EMPTY_FUNCTION match is a React event handler prop in a test. */
function isEmptyFunctionTestEventHandler(line: string, isTestFile: boolean): boolean {
  return (
    isTestFile &&
    /\bon[A-Z]\w{0,50}[ \t]*[:=][ \t]*(?:\{[ \t]*)?\([ \t]*\)[ \t]*=>[ \t]*\{[ \t]*\}[ \t]*\}?/.test(
      line
    )
  );
}

/** Returns true if an EMPTY_FUNCTION match is a react-hook-form handleSubmit noop in a test. */
function isEmptyFunctionFormHandleSubmit(line: string, isTestFile: boolean): boolean {
  return isTestFile && /\bhandleSubmit\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line);
}

/** Returns true if an EMPTY_FUNCTION match is a named noop variable. */
function isEmptyFunctionNamedNoop(line: string): boolean {
  return /\b(?:const|let|var)\s+no[_-]?[Oo]p\b/i.test(line);
}

/** Returns true if an EMPTY_FUNCTION match is in a storybook file. */
function isEmptyFunctionInStorybook(relativePath: string): boolean {
  return /\.stories\.[jt]sx?$/.test(relativePath);
}

/** Returns true if an EMPTY_FUNCTION match is an empty lifecycle hook delegated via comment. */
function isEmptyFunctionEmptyLifecycle(line: string, isTestFile: boolean): boolean {
  return (
    isTestFile &&
    /\b(?:beforeEach|afterEach|beforeAll|afterAll)\s*\(\s*(?:async\s+)?\(\s*\)\s*=>\s*\{/.test(line)
  );
}

/**
 * Returns true if an EMPTY_FUNCTION match should be suppressed.
 */
function shouldSkipEmptyFunction(ctx: LineFilterContext): boolean {
  const { line, lineIndex, lines, relativePath, isTestFile } = ctx;
  const prevLine = lineIndex > 0 ? lines[lineIndex - 1] : '';

  if (isEmptyFunctionNullCoalescing(line, prevLine)) return true;
  if (isEmptyFunctionMenuSeparator(line)) return true;
  if (isEmptyFunctionFireAndForget(line)) return true;
  if (isEmptyFunctionTestMockBoilerplate(line, isTestFile)) return true;
  if (isEmptyFunctionCommentedNoop(line, prevLine)) return true;
  if (isEmptyFunctionSpyMock(line, isTestFile)) return true;
  if (isEmptyFunctionTestEventHandler(line, isTestFile)) return true;
  if (isEmptyFunctionFormHandleSubmit(line, isTestFile)) return true;
  if (isEmptyFunctionNamedNoop(line)) return true;
  if (isEmptyFunctionInStorybook(relativePath)) return true;
  if (isEmptyFunctionEmptyLifecycle(line, isTestFile)) return true;
  return false;
}

/**
 * Determines if a specific pattern match on a line should be skipped.
 * This is the orchestrator that delegates to per-pattern helpers.
 */
function shouldSkipMatch(patternName: string, matchIndex: number, ctx: LineFilterContext): boolean {
  const { line, isTestFile, isVitestConfig } = ctx;

  if (shouldSkipTestPattern(patternName, isTestFile)) return true;
  if (shouldSkipStubInVitestConfig(patternName, isVitestConfig)) return true;

  if (patternName === 'PLACEHOLDER') return shouldSkipPlaceholder(ctx, matchIndex);
  if (patternName === 'XXX') return shouldSkipXxx(line, matchIndex);
  if (patternName === 'SIMULATED_DATA') return shouldSkipSimulatedData(ctx);
  if (patternName === 'TODO') return shouldSkipTodo(ctx);
  if (patternName === 'MOCK_RETURN') return isTestFile;
  if (patternName === 'STUB') return shouldSkipStub(ctx);
  if (patternName === 'EMPTY_FUNCTION') return shouldSkipEmptyFunction(ctx);

  return false;
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

      const ctx: LineFilterContext = {
        line,
        lineIndex,
        lines,
        relativePath,
        isTestFile,
        isVitestConfig,
      };

      // Check each pattern
      for (const [patternName, regex] of Object.entries(PLACEHOLDER_PATTERNS)) {
        // Reset regex state for global patterns
        regex.lastIndex = 0;

        let match;
        while ((match = regex.exec(line)) !== null) {
          if (shouldSkipMatch(patternName, match.index, ctx)) continue;

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

// =============================================================================
// Multi-line empty function guards
// =============================================================================

interface MultiLineEmptyFunctionContext {
  matchedText: string;
  context: string;
  contextStart: number;
  matchIndex: number;
  isTestFileMl: boolean;
  isStorybookMl: boolean;
}

/** Returns true if a multi-line empty function is a null-coalescing fallback. */
function isMlNullCoalescingFallback(ctx: MultiLineEmptyFunctionContext): boolean {
  return (
    /\?\?\s*\{/.test(ctx.context) && ctx.context.indexOf('??') < ctx.matchIndex - ctx.contextStart
  );
}

/** Returns true if a multi-line empty function is a fire-and-forget .catch. */
function isMlFireAndForgetCatch(ctx: MultiLineEmptyFunctionContext): boolean {
  const beforeMatch = ctx.context.substring(
    Math.max(0, ctx.matchIndex - ctx.contextStart - 30),
    ctx.matchIndex - ctx.contextStart
  );
  return (
    /\.catch\s*\(\s*(?:async\s+)?\(\s*\)\s*=>/.test(ctx.matchedText) ||
    /\.catch\s*\(/.test(beforeMatch)
  );
}

/** Returns true if a multi-line empty function has a commented no-op annotation. */
function isMlCommentedNoop(ctx: MultiLineEmptyFunctionContext): boolean {
  return /\/\/\s*(?:No-op|Defensive|intentional|Swallow|Silent|read-only)/i.test(ctx.context);
}

/** Returns true if a multi-line empty function is test mock boilerplate. */
function isMlTestMockBoilerplate(ctx: MultiLineEmptyFunctionContext): boolean {
  if (!ctx.isTestFileMl) return false;
  return (
    /\.mockImplementation\s*\(/.test(ctx.context) ||
    /\bclearDomainEvents\s*:/.test(ctx.context) ||
    /\bvi\.fn\b/.test(ctx.context) ||
    /\bon[A-Z]\w*\s*[:=]/.test(ctx.context) ||
    /\bhandleSubmit\s*\(/.test(ctx.context) ||
    /\b(?:beforeEach|afterEach|beforeAll|afterAll)\s*\(/.test(ctx.context)
  );
}

/** Returns true if a multi-line empty function is a named noop. */
function isMlNamedNoop(ctx: MultiLineEmptyFunctionContext): boolean {
  return /\b(?:const|let|var)\s+no[_-]?[Oo]p\b/i.test(ctx.context);
}

/** Returns true if a multi-line empty function is a menu separator no-op. */
function isMlMenuSeparator(ctx: MultiLineEmptyFunctionContext): boolean {
  return /\bseparator\s*:\s*true\b/.test(ctx.context) && /onClick\s*:/.test(ctx.context);
}

/** Returns true if a multi-line empty function has a defensive fallback comment. */
function isMlDefensiveFallbackComment(ctx: MultiLineEmptyFunctionContext): boolean {
  return /\/\/\s*(?:Defensive|Separator|Required by type)/i.test(ctx.context);
}

/**
 * Returns true if a multi-line empty function match should be suppressed.
 */
function shouldSkipMultiLineEmptyFunction(ctx: MultiLineEmptyFunctionContext): boolean {
  if (isMlNullCoalescingFallback(ctx)) return true;
  if (isMlFireAndForgetCatch(ctx)) return true;
  if (isMlCommentedNoop(ctx)) return true;
  if (isMlTestMockBoilerplate(ctx)) return true;
  if (isMlNamedNoop(ctx)) return true;
  if (ctx.isStorybookMl) return true;
  if (isMlMenuSeparator(ctx)) return true;
  if (isMlDefensiveFallbackComment(ctx)) return true;
  return false;
}

/**
 * Detects empty functions that span multiple lines
 */
function detectEmptyFunctions(content: string, relativePath: string): PlaceholderFinding[] {
  const findings: PlaceholderFinding[] = [];

  // Pattern for functions with only whitespace/comments in body
  const multiLineEmptyFunction =
    /(?:function[ \t]+(\w{1,100})|(\w{1,100})[ \t]*[:=][ \t]*(?:async[ \t]+)?function|\([\w, \t]{0,200}\)[ \t]*=>)[ \t]*\{[ \t\n]*(?:\/\/[^\n]{0,200}\n[ \t\n]*){0,20}\}/g;

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
      const contextStart = Math.max(0, match.index - 200);
      const contextEnd = Math.min(content.length, match.index + match[0].length + 100);
      const context = content.substring(contextStart, contextEnd);

      const isTestFileMl = CONTEXT_EXCLUSIONS.testFilePaths.some((p) => p.test(relativePath));
      const isStorybookMl = /\.stories\.[jt]sx?$/.test(relativePath);

      const mlCtx: MultiLineEmptyFunctionContext = {
        matchedText: match[0],
        context,
        contextStart,
        matchIndex: match.index,
        isTestFileMl,
        isStorybookMl,
      };

      if (shouldSkipMultiLineEmptyFunction(mlCtx)) continue;

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
