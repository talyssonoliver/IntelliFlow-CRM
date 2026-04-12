import { describe, it, expect, vi, beforeEach, afterEach, expectTypeOf } from 'vitest';

// Strictly typed helpers and types live in this test to keep it self-contained.
// These functions model the spec’s logic for validation.

type ServiceId =
  | '@intelliflow/web'
  | '@intelliflow/project-tracker'
  | '@intelliflow/api'
  | '@intelliflow/worker';
type ServiceKind = 'web' | 'dashboard' | 'api' | 'worker';

interface Service {
  readonly id: ServiceId;
  readonly kind: ServiceKind;
  readonly requiresNodeGte?: string;
}

type SuggestionCategory = 'nvm' | 'nvm-windows' | 'manual' | 'alternatives';

interface Suggestion {
  readonly category: SuggestionCategory;
  readonly message: string;
  readonly commands?: readonly string[];
}

interface CheckResult {
  readonly ok: boolean;
  readonly currentVersion: string;
  readonly requiredRange: string;
  readonly failingServices: readonly ServiceId[];
  readonly suggestions: readonly Suggestion[];
}

interface VersionCheckConfig {
  readonly requiredRange: string; // e.g. ">=20.9.0"
  readonly services: readonly Service[];
}

// Services as described in the spec
const SERVICES = [
  { id: '@intelliflow/web', kind: 'web', requiresNodeGte: '>=20.9.0' },
  { id: '@intelliflow/project-tracker', kind: 'dashboard', requiresNodeGte: '>=20.9.0' },
  { id: '@intelliflow/api', kind: 'api' },
  { id: '@intelliflow/worker', kind: 'worker' },
] as const satisfies readonly Service[];

class SemverParseError extends Error {
  name = 'SemverParseError' as const;
}

class RangeParseError extends Error {
  name = 'RangeParseError' as const;
}

interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: string | null;
}

// Minimal semver utilities sufficient for this spec
function parseSemver(input: string): SemanticVersion {
  const raw = input.trim();
  // Accept optional leading 'v' or 'V'
  const normalized = raw.startsWith('v') || raw.startsWith('V') ? raw.slice(1) : raw;
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?$/);
  if (!match) {
    throw new SemverParseError(`Invalid semver: ${input}`);
  }
  const [, maj, min, pat, pre] = match;
  const major = Number(maj);
  const minor = Number(min);
  const patch = Number(pat);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    throw new SemverParseError(`Invalid semver components: ${input}`);
  }
  return { major, minor, patch, prerelease: pre ?? null };
}

function compareSemver(a: SemanticVersion, b: SemanticVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  const aPre = a.prerelease ?? null;
  const bPre = b.prerelease ?? null;
  if (aPre === bPre) return 0;
  // No prerelease means higher precedence than any prerelease
  if (aPre === null) return 1;
  if (bPre === null) return -1;
  // Rough lexical/numeric prerelease comparison (sufficient for these tests)
  const aParts = aPre.split('.');
  const bParts = bPre.split('.');
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const as = aParts[i];
    const bs = bParts[i];
    if (as === undefined) return -1;
    if (bs === undefined) return 1;
    const an = /^\d+$/.test(as) ? Number(as) : NaN;
    const bn = /^\d+$/.test(bs) ? Number(bs) : NaN;
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      if (an !== bn) return an < bn ? -1 : 1;
    } else if (!Number.isNaN(an)) {
      return -1; // numeric identifiers have lower precedence than non-numeric per semver? Actually they compare numerically; keep consistent
    } else if (!Number.isNaN(bn)) {
      return 1;
    } else if (as !== bs) {
      return as < bs ? -1 : 1;
    }
  }
  return 0;
}

function parseGteRange(range: string): SemanticVersion {
  const r = range.trim();
  const match = r.match(/^>=\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?)$/);
  if (!match) throw new RangeParseError(`Unsupported range: ${range}`);
  return parseSemver(match[1]);
}

function satisfiesGteRange(version: string, range: string): boolean {
  const v = parseSemver(version);
  const floor = parseGteRange(range);
  const cmp = compareSemver(v, floor);
  return cmp >= 0;
}

// External dependency wrapper (mocked in tests)
const envUtils = {
  getCurrentNodeVersion(): string {
    return process.version;
  },
} as const;

function evaluateEnvironment(config: VersionCheckConfig): CheckResult {
  const current = envUtils.getCurrentNodeVersion();
  // Validate required range and version parsing explicitly for strictness
  if (!config.requiredRange) throw new RangeParseError('requiredRange is empty');

  const ok = satisfiesGteRange(current, config.requiredRange);

  const failingServices: ServiceId[] = [];
  for (const svc of config.services) {
    if (svc.requiresNodeGte && !satisfiesGteRange(current, svc.requiresNodeGte)) {
      failingServices.push(svc.id);
    }
  }

  const suggestions: Suggestion[] = [];
  if (!ok) {
    suggestions.push(
      {
        category: 'nvm',
        message: 'Upgrade Node.js to 20+ using nvm (recommended).',
        commands: ['nvm install 20', 'nvm use 20'],
      },
      {
        category: 'nvm-windows',
        message: 'On Windows, upgrade using nvm-windows.',
        commands: ['nvm install 20.11.0', 'nvm use 20.11.0'],
      },
      {
        category: 'manual',
        message: 'Alternatively, install Node.js 20 LTS from nodejs.org.',
        commands: ['https://nodejs.org/'],
      },
      {
        category: 'alternatives',
        message: 'Run only services compatible with Node 18.',
        commands: ['pnpm run dev:api', 'pnpm run dev:worker'],
      }
    );
  }

  return {
    ok,
    currentVersion: current,
    requiredRange: config.requiredRange,
    failingServices,
    suggestions,
  };
}

describe('ENV-009: Node.js version requirement and fallbacks', () => {
  const config: VersionCheckConfig = {
    requiredRange: '>=20.9.0',
    services: SERVICES,
  };

  const spyTargets = { envUtils };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: Node v20.11.0 satisfies >=20.9.0; no failing services', () => {
    const spy = vi.spyOn(spyTargets.envUtils, 'getCurrentNodeVersion').mockReturnValue('v20.11.0');
    expect(spy).toBeDefined();

    const result = evaluateEnvironment(config);
    expect(result.ok).toBe(true);
    expect(result.currentVersion).toBe('v20.11.0');
    expect(result.requiredRange).toBe('>=20.9.0');
    expect(result.failingServices).toEqual([]);
    expect(result.suggestions.length).toBe(0);

    // Type-level assertion (compile-time)
    expectTypeOf(result.suggestions).toMatchTypeOf<readonly Suggestion[]>();
  });

  it('exact boundary: Node 20.9.0 satisfies >=20.9.0', () => {
    vi.spyOn(spyTargets.envUtils, 'getCurrentNodeVersion').mockReturnValue('20.9.0');
    const result = evaluateEnvironment(config);
    expect(result.ok).toBe(true);
    expect(result.failingServices).toEqual([]);
  });

  it('pre-release below stable: Node 20.9.0-rc.1 does not satisfy >=20.9.0', () => {
    vi.spyOn(spyTargets.envUtils, 'getCurrentNodeVersion').mockReturnValue('v20.9.0-rc.1');
    const result = evaluateEnvironment(config);
    expect(result.ok).toBe(false);
    expect(result.failingServices).toEqual(['@intelliflow/web', '@intelliflow/project-tracker']);
    // Ensure upgrade and fallback suggestions are present
    const cats = result.suggestions.map((s) => s.category);
    expect(cats).toEqual(expect.arrayContaining(['nvm', 'nvm-windows', 'manual', 'alternatives']));
    const allCmds = result.suggestions.flatMap((s) => s.commands ?? []);
    expect(allCmds).toEqual(expect.arrayContaining(['nvm install 20', 'nvm use 20']));
    expect(allCmds).toEqual(expect.arrayContaining(['nvm install 20.11.0', 'nvm use 20.11.0']));
    expect(allCmds).toEqual(expect.arrayContaining(['pnpm run dev:api', 'pnpm run dev:worker']));
  });

  it('edge: whitespace and uppercase V prefix are handled', () => {
    vi.spyOn(spyTargets.envUtils, 'getCurrentNodeVersion').mockReturnValue('  V21.0.0  ');
    const result = evaluateEnvironment(config);
    expect(result.ok).toBe(true);
  });

  it('failure path: Node 18.19.1 triggers failures for web and project-tracker with guidance', () => {
    vi.spyOn(spyTargets.envUtils, 'getCurrentNodeVersion').mockReturnValue('v18.19.1');
    const result = evaluateEnvironment(config);
    expect(result.ok).toBe(false);
    expect(result.currentVersion).toBe('v18.19.1');
    expect(result.failingServices).toContain('@intelliflow/web');
    expect(result.failingServices).toContain('@intelliflow/project-tracker');

    // Guidance must include all three upgrade options + alternatives
    const byCat = new Map(result.suggestions.map((s) => [s.category, s]));
    expect(byCat.has('nvm')).toBe(true);
    expect(byCat.has('nvm-windows')).toBe(true);
    expect(byCat.has('manual')).toBe(true);
    expect(byCat.has('alternatives')).toBe(true);

    expect(byCat.get('alternatives')?.commands).toEqual(
      expect.arrayContaining(['pnpm run dev:api', 'pnpm run dev:worker'])
    );
  });

  it('error handling: invalid current version string throws SemverParseError', () => {
    vi.spyOn(spyTargets.envUtils, 'getCurrentNodeVersion').mockReturnValue('vX.Y.Z');
    expect(() => evaluateEnvironment(config)).toThrowError(SemverParseError);
  });

  it('error handling: invalid required range throws RangeParseError', () => {
    vi.spyOn(spyTargets.envUtils, 'getCurrentNodeVersion').mockReturnValue('v20.11.0');
    const bad: VersionCheckConfig = { requiredRange: '=>20.9.0', services: SERVICES };
    expect(() => evaluateEnvironment(bad)).toThrowError(RangeParseError);
  });
});
