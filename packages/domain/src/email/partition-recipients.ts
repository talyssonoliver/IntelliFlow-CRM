import { normalizeEmail } from './email-address';

export interface RecipientLists {
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
}

export interface PartitionedRecipients {
  to: string[];
  cc: string[];
  bcc: string[];
  /** Suppressed addresses that were dropped, normalized, each listed once. */
  skipped: string[];
}

/**
 * Drops suppressed recipients and duplicates (owner ruling Q9: skip the
 * suppressed ones, send to the rest). Order is preserved; an address that
 * appears in several lists is kept in the first one only. Comparison is
 * case-insensitive; kept addresses keep their original spelling.
 */
export function partitionRecipients(
  lists: RecipientLists,
  suppressed: ReadonlySet<string>
): PartitionedRecipients {
  const seen = new Set<string>();
  const skipped: string[] = [];

  const keep = (addresses: readonly string[] | undefined): string[] => {
    const kept: string[] = [];
    for (const address of addresses ?? []) {
      const key = normalizeEmail(address);
      if (seen.has(key)) continue;
      seen.add(key);
      if (suppressed.has(key)) {
        skipped.push(key);
      } else {
        kept.push(address);
      }
    }
    return kept;
  };

  return { to: keep(lists.to), cc: keep(lists.cc), bcc: keep(lists.bcc), skipped };
}
