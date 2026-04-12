/**
 * Lead Scoring Dashboard Utilities (PG-148)
 */

export function formatModelVersion(version: string): string {
  const parts = version.split(':');
  if (parts.length >= 3) {
    return `${parts[2]}`;
  }
  return version.length > 20 ? version.slice(0, 20) + '...' : version;
}

export function formatScoredAt(isoDate: string): string {
  const now = Date.now();
  const scored = new Date(isoDate).getTime();
  const diffMs = now - scored;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
