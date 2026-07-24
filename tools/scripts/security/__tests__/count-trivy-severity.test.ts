import { describe, it, expect } from 'vitest';
import { classifyBand, countBands, toGithubOutput } from '../count-trivy-severity.mjs';

/** Build a minimal Trivy-shaped SARIF from [ruleId, security-severity] pairs. */
function sarifFrom(pairs: Array<[string, string | null]>) {
  return {
    runs: [
      {
        tool: {
          driver: {
            rules: pairs.map(([id, sev]) => ({
              id,
              properties: sev == null ? {} : { 'security-severity': sev },
            })),
          },
        },
        results: pairs.map(([id]) => ({ ruleId: id, level: 'error' })),
      },
    ],
  };
}

describe('classifyBand — CVSS v3 bands are deterministic across all severity bands', () => {
  const cases: Array<[number, string]> = [
    [10.0, 'critical'],
    [9.0, 'critical'], // lower boundary of critical
    [8.9, 'high'],
    [7.0, 'high'], // lower boundary of high
    [6.9, 'medium'],
    [4.0, 'medium'], // lower boundary of medium
    [3.9, 'low'],
    [0.1, 'low'], // lower boundary of low
    [0, 'none'],
    [-1, 'none'],
    [Number.NaN, 'none'],
    [Number.POSITIVE_INFINITY, 'none'], // not finite -> none
  ];
  it.each(cases)('score %s -> %s', (score, band) => {
    expect(classifyBand(score)).toBe(band);
  });
});

describe('countBands — reads numeric security-severity, not SARIF level', () => {
  it('regression: the 9 "error" results from run 30100561471 are 1 critical, not 9', () => {
    // Real breakdown that the old `select(.level=="error") | length` mislabelled as "9 critical".
    const sarif = sarifFrom([
      ['CVE-2026-54466', '9.5'], // websocket-driver — the ONLY true critical
      ['CVE-2026-13676', '7.5'],
      ['CVE-2026-16221', '7.5'],
      ['CVE-2026-59869-a', '7.5'],
      ['CVE-2026-59869-b', '7.5'],
      ['CVE-2026-13311', '7.5'],
      ['GHSA-2p49-hgcm-8545', '8.2'],
      ['CVE-2026-59869-c', '7.5'],
      ['CVE-2026-13149', '5.3'], // medium
    ]);
    expect(countBands(sarif)).toEqual({
      critical: 1,
      high: 7,
      medium: 1,
      low: 0,
      none: 0,
      total: 9,
    });
  });

  it('counts every band + missing severity as none', () => {
    const sarif = sarifFrom([
      ['crit', '9.8'],
      ['high', '7.1'],
      ['med', '5.0'],
      ['low', '2.0'],
      ['nosev', null], // rule with no security-severity -> none
    ]);
    expect(countBands(sarif)).toEqual({
      critical: 1,
      high: 1,
      medium: 1,
      low: 1,
      none: 1,
      total: 5,
    });
  });

  it('resolves severity from tool.extensions[].rules when driver.rules lacks it', () => {
    const sarif = {
      runs: [
        {
          tool: {
            driver: { rules: [] },
            extensions: [{ rules: [{ id: 'X', properties: { 'security-severity': '9.1' } }] }],
          },
          results: [{ ruleId: 'X' }],
        },
      ],
    };
    expect(countBands(sarif).critical).toBe(1);
  });

  it('a result whose ruleId has no matching rule counts as none', () => {
    const sarif = { runs: [{ tool: { driver: { rules: [] } }, results: [{ ruleId: 'unknown' }] }] };
    expect(countBands(sarif)).toMatchObject({ none: 1, total: 1, critical: 0 });
  });

  it('handles empty / malformed SARIF without throwing', () => {
    expect(countBands({}).total).toBe(0);
    expect(countBands({ runs: [] }).total).toBe(0);
    expect(countBands(null as unknown as object).total).toBe(0);
  });

  it('is deterministic — identical input yields identical counts', () => {
    const sarif = sarifFrom([
      ['a', '9.5'],
      ['b', '7.0'],
      ['c', '4.0'],
    ]);
    expect(countBands(sarif)).toEqual(countBands(sarif));
  });
});

describe('toGithubOutput', () => {
  it('renders stable key=value lines for $GITHUB_OUTPUT', () => {
    const out = toGithubOutput({ critical: 1, high: 7, medium: 1, low: 0, none: 0, total: 9 });
    expect(out).toBe(
      [
        'critical_count=1',
        'high_count=7',
        'medium_count=1',
        'low_count=0',
        'none_count=0',
        'total_count=9',
      ].join('\n')
    );
  });
});
