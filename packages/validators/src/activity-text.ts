/**
 * User-facing activity text without machine identifiers (register row 42).
 *
 * Scripts and syncs that log activity on a lead sometimes put a system id in the text, for example
 * "... Pitshanger Health and Fitness. COA ledger row cmw5j72u40001p5ug01kf3vot." A user cannot use that id
 * and it reads as a leak of internals. The ids belong in an activity's metadata, never in its title or
 * description.
 *
 * Pure, browser safe, no dependencies and no backtracking patterns: it is used by the API when an
 * activity is written, by the web when one is shown, and by the one-off cleanup script for rows that were
 * written before.
 */

/** A cuid: "c" and 24 lowercase letters or digits (Prisma's default id). */
const CUID = /\bc[a-z0-9]{24}\b/g;

/** A UUID, any version. */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Words that introduce an id ("COA ledger row <id>", "lead id <id>", "ref <id>"). The label goes with the
 * id: "COA ledger row" alone says nothing.
 */
const LABELS: readonly string[] = [
  'coa ledger row',
  'ledger row',
  'coa lead id',
  'coa lead',
  'lead id',
  'row id',
  'row',
  'id',
  'ref',
  'reference',
];

/** A real cuid has a digit; a 25 letter lowercase word starting with c is not one. */
function isMachineCuid(token: string): boolean {
  return /\d/.test(token);
}

function removeLabelledIds(text: string): string {
  let out = '';
  let cursor = 0;
  for (const match of text.matchAll(CUID)) {
    if (!isMachineCuid(match[0])) continue;
    const at = match.index ?? 0;
    const prefix = out + text.slice(cursor, at);
    let head = prefix.trimEnd();
    if (head.endsWith(':')) head = head.slice(0, -1).trimEnd();
    const lower = head.toLowerCase();
    const label = LABELS.find((word) => {
      if (!lower.endsWith(word)) return false;
      const lead = head.charAt(head.length - word.length - 1);
      return lead === '' || !/[a-z0-9]/i.test(lead);
    });
    out = label ? head.slice(0, head.length - label.length) : prefix;
    cursor = at;
  }
  return out + text.slice(cursor);
}

/** Tidy what removing an id left behind: doubled spaces, a space before punctuation, a dangling colon. */
function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .split(/[ \t]{2,}/)
        .join(' ')
        .trimEnd()
    )
    .map((line) => (line === '.' ? '' : line))
    .join('\n')
    .split(' .')
    .join('.')
    .split(' ,')
    .join(',')
    .split(' ;')
    .join(';')
    .split('..')
    .join('.')
    .trim();
}

/**
 * The text with machine ids removed: cuids and UUIDs, and the label in front of one ("COA ledger row",
 * "lead id"). Text without an id is returned unchanged.
 */
export function stripMachineIds(text: string): string {
  const withoutLabelled = removeLabelledIds(text);
  const bare = withoutLabelled
    .replace(CUID, (token) => (isMachineCuid(token) ? '' : token))
    .replace(UUID, '');
  return bare === text ? text : tidy(bare);
}

/** True when the text carries a machine id. */
export function hasMachineId(text: string): boolean {
  return stripMachineIds(text) !== text;
}
