/**
 * A tick on a public page means the feature works. A line that says it is planned or
 * coming soon gets a neutral icon instead, so the two can't be confused.
 */
const NOT_YET_BUILT = /\b(planned|coming soon)\b/i;

export function isPlannedFeature(text: string): boolean {
  return NOT_YET_BUILT.test(text);
}

export function featureIcon(text: string): 'schedule' | 'check_circle' {
  return isPlannedFeature(text) ? 'schedule' : 'check_circle';
}
