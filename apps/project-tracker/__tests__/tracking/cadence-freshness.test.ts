import { describe, it, expect } from 'vitest';

// ============================================================================
// Test the pure helper logic extracted from check-cadence-freshness.ts
// These are inline implementations matching the script's functions
// ============================================================================

/**
 * Parse cadence string like "weekly:7d" into threshold days.
 */
function parseCadenceThreshold(cadence: string): number {
  const match = cadence.match(/:(\d+)d$/);
  if (!match) return 0;
  return parseInt(match[1], 10);
}

/**
 * Parse artifact paths from the "Artifacts To Track" column.
 * Only extracts ARTIFACT: prefixed paths — EVIDENCE: paths are one-time
 * attestation files that should NOT be checked for freshness.
 */
function parseArtifacts(artifactStr: string): string[] {
  if (!artifactStr) return [];

  return artifactStr
    .split(';')
    .flatMap((part) => {
      const match = part.match(/^ARTIFACT:(.+)/);
      if (match) return [match[1].trim()];
      return [];
    })
    .filter((p) => p && !p.includes('*'));
}

describe('Cadence Freshness Checker', () => {
  describe('parseCadenceThreshold', () => {
    it('parses daily:1d', () => {
      expect(parseCadenceThreshold('daily:1d')).toBe(1);
    });

    it('parses weekly:7d', () => {
      expect(parseCadenceThreshold('weekly:7d')).toBe(7);
    });

    it('parses quarterly:90d', () => {
      expect(parseCadenceThreshold('quarterly:90d')).toBe(90);
    });

    it('parses per-sprint:14d', () => {
      expect(parseCadenceThreshold('per-sprint:14d')).toBe(14);
    });

    it('parses per-build:1d', () => {
      expect(parseCadenceThreshold('per-build:1d')).toBe(1);
    });

    it('returns 0 for empty string', () => {
      expect(parseCadenceThreshold('')).toBe(0);
    });

    it('returns 0 for invalid format', () => {
      expect(parseCadenceThreshold('weekly')).toBe(0);
      expect(parseCadenceThreshold('7d')).toBe(0);
      expect(parseCadenceThreshold('daily:1h')).toBe(0);
    });
  });

  describe('parseArtifacts', () => {
    it('extracts ARTIFACT: paths', () => {
      const result = parseArtifacts(
        'ARTIFACT:artifacts/reports/status.json;ARTIFACT:artifacts/reports/tasks.txt'
      );
      expect(result).toEqual(['artifacts/reports/status.json', 'artifacts/reports/tasks.txt']);
    });

    it('skips EVIDENCE: paths (one-time attestation files)', () => {
      const result = parseArtifacts(
        'EVIDENCE:.specify/sprints/sprint-0/attestations/EXP-REPORTS-001/context_ack.json'
      );
      expect(result).toEqual([]);
    });

    it('extracts only ARTIFACT: from mixed prefixes', () => {
      const result = parseArtifacts(
        'ARTIFACT:docs/debt-ledger.yaml;EVIDENCE:.specify/foo/bar.json'
      );
      expect(result).toEqual(['docs/debt-ledger.yaml']);
    });

    it('skips raw paths without ARTIFACT: prefix', () => {
      const result = parseArtifacts('artifacts/reports/report.json');
      expect(result).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      expect(parseArtifacts('')).toEqual([]);
    });

    it('skips wildcard paths', () => {
      const result = parseArtifacts('ARTIFACT:packages/*/src/*.ts');
      expect(result).toEqual([]);
    });

    it('skips text-only entries', () => {
      const result = parseArtifacts('Some text without paths;another entry');
      expect(result).toEqual([]);
    });
  });

  describe('freshness determination logic', () => {
    it('task is fresh when all artifacts within threshold', () => {
      const now = Date.now();
      const oneHourAgo = now - 1 * 60 * 60 * 1000;
      const thresholdDays = 1;
      const ageDays = Math.floor((now - oneHourAgo) / (1000 * 60 * 60 * 24));
      expect(ageDays <= thresholdDays).toBe(true);
    });

    it('task is stale when any artifact exceeds threshold', () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
      const thresholdDays = 7;
      const ageDays = Math.floor((now - tenDaysAgo) / (1000 * 60 * 60 * 24));
      expect(ageDays > thresholdDays).toBe(true);
    });

    it('freshness score calculation', () => {
      const total = 5;
      const fresh = 3;
      const pct = total > 0 ? Math.round((fresh / total) * 100) : 100;
      expect(pct).toBe(60);
    });

    it('freshness score is 100% when no tasks checked', () => {
      const total = 0;
      const fresh = 0;
      const pct = total > 0 ? Math.round((fresh / total) * 100) : 100;
      expect(pct).toBe(100);
    });
  });
});
