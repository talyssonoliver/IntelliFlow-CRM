/**
 * CSV Status Mapping Utilities
 */

/**
 * Map CSV status to registry status
 */
export function mapCsvStatusToRegistry(status: string): string {
  if (status === 'Done' || status === 'Completed') return 'DONE';
  if (status === 'In Progress') return 'IN_PROGRESS';
  if (status === 'Validating') return 'VALIDATING';
  if (status === 'Blocked') return 'BLOCKED';
  if (status === 'Planned') return 'PLANNED';
  if (status === 'Backlog') return 'BACKLOG';
  if (status === 'Failed') return 'FAILED';
  if (status === 'Needs Human') return 'NEEDS_HUMAN';
  if (status === 'In Review') return 'IN_REVIEW';

  console.warn(`⚠️  Unknown status "${status}" - defaulting to PLANNED`);
  return 'PLANNED';
}

/**
 * Map CSV status to individual task file status
 */
export function mapCsvStatusToIndividual(status: string): string {
  return mapCsvStatusToRegistry(status);
}

/**
 * Map CSV status to graph status enum
 */
export function mapCsvStatusToGraph(
  status: string
): 'DONE' | 'IN_PROGRESS' | 'BLOCKED' | 'PLANNED' | 'BACKLOG' | 'FAILED' {
  const normalized = (status || '').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'completed') return 'DONE';
  if (normalized === 'in progress' || normalized === 'validating') return 'IN_PROGRESS';
  if (normalized === 'blocked' || normalized === 'needs human') return 'BLOCKED';
  if (normalized === 'failed') return 'FAILED';
  if (normalized === 'backlog' || normalized === 'not started') return 'BACKLOG';
  if (normalized === 'planned') return 'PLANNED';
  return 'PLANNED';
}

/**
 * Parse dependencies string to array
 */
export function parseDependencies(depsString: string): string[] {
  return depsString
    .split(',')
    .map((d: string) => d.trim())
    .filter((d: string) => d.length > 0 && d !== 'None' && d !== '-');
}

/**
 * Parse artifacts string to array
 */
export function parseArtifacts(artifactsString: string): string[] {
  return artifactsString
    .split(',')
    .map((a: string) => a.trim())
    .filter((a: string) => a.length > 0);
}
