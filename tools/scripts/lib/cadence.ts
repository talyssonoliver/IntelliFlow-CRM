/**
 * Parsing for tools/scripts/check-cadence-freshness.ts, kept here so it can be tested: the
 * script runs main() on import, so its test used to copy these functions (#1216).
 */

/** The threshold in days from a cadence such as "weekly:7d"; 0 when there is none. */
export function parseCadenceThreshold(cadence: string): number {
  const match = /:(\d+)d$/.exec(cadence);
  if (!match) return 0;
  return Number.parseInt(match[1], 10);
}

/**
 * The artifact paths to check from the "Artifacts To Track" column: only `ARTIFACT:` entries
 * (`EVIDENCE:` files are one-time attestations, not refreshed on a cadence), without globs.
 */
export function parseArtifacts(artifactStr: string): string[] {
  if (!artifactStr) return [];

  return artifactStr
    .split(';')
    .flatMap((part) => {
      const match = /^ARTIFACT:(.+)/.exec(part);
      if (match) return [match[1].trim()];
      return [];
    })
    .filter((p) => p && !p.includes('*'));
}
