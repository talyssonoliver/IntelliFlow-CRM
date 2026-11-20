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
 * written before. Only the removal point is tidied; the rest of the text is returned as it was.
 */

/** What a title becomes when it was nothing but an id. */
export const FALLBACK_ACTIVITY_TITLE = 'Activity';

/** A cuid: "c" and 24 letters or digits (Prisma's default id). One without a digit is a word. */
const CUID = /\bc[a-z0-9]{24}\b/gi;

/** A UUID, any version. */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Words that introduce an id, longest first. The label goes with the id: "COA ledger row" alone says nothing. */
const LABELS: readonly string[] = [
  'coa ledger row',
  'coa lead id',
  'ledger row',
  'coa ledger',
  'coa lead',
  'lead id',
  'row id',
  'reference',
  'row',
  'ref',
  'id',
];

interface IdMatch {
  index: number;
  length: number;
}

function firstId(text: string): IdMatch | null {
  let best: IdMatch | null = null;
  for (const re of [CUID, UUID]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (re === CUID && !/\d/.test(m[0])) continue;
      if (!best || m.index < best.index) best = { index: m.index, length: m[0].length };
      break;
    }
  }
  return best;
}

const SPACES = new Set([' ', '\t']);

/** What may sit right before a label word: a space, a bracket or a quote (not : or ;, which occur inside links). */
const WORD_STARTS = ' \t\r\n([{"\'';

function trimSpacesEnd(text: string): string {
  let end = text.length;
  while (end > 0 && SPACES.has(text.charAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

function trimSpacesStart(text: string): string {
  let start = 0;
  while (start < text.length && SPACES.has(text.charAt(start))) start += 1;
  return text.slice(start);
}

/** True when the text ends inside a link, path or email address: its last word (back to a space) is one. */
function endsInsideAddress(before: string): boolean {
  let start = before.length;
  while (start > 0 && !' \t\r\n'.includes(before.charAt(start - 1))) start -= 1;
  const word = before.slice(start).toLowerCase();
  return word.includes('/') || word.includes('@') || word.startsWith('www.');
}
/** The text without a label at its end ("... COA ledger row" -> "... "), repeated for "row id". */
function withoutTrailingLabels(text: string): string {
  let out = text;
  for (;;) {
    let head = trimSpacesEnd(out);
    if (head.endsWith(':')) head = trimSpacesEnd(head.slice(0, -1));
    // "lead_id" and "lead-id" read as "lead id".
    const lower = head.toLowerCase().split('_').join(' ').split('-').join(' ');
    const label = LABELS.find((word) => {
      if (!lower.endsWith(word)) return false;
      const lead = head.charAt(head.length - word.length - 1);
      // A standalone word only: not the end of a longer word, a domain or a path ("/reference").
      const boundary = lead === '' || WORD_STARTS.includes(lead);
      // ...and not a word that is itself a link, path or email ("?q=(reference").
      return boundary && !endsInsideAddress(head.slice(0, head.length - word.length));
    });
    if (!label) return out;
    out = head.slice(0, head.length - label.length);
  }
}

/** Closes the gap an id left: "()" , a space before punctuation, a doubled full stop. */
function closeGap(before: string, after: string): [string, string] {
  let out = before;
  let rest = after;
  if (out.endsWith('(') && rest.startsWith(')')) {
    out = trimSpacesEnd(out.slice(0, -1));
    rest = rest.slice(1);
  }
  if (rest.startsWith('.') || rest.startsWith(',') || rest.startsWith(';')) {
    out = trimSpacesEnd(out);
    if (out === '' || out.endsWith('\n') || (out.endsWith('.') && rest.startsWith('.'))) {
      rest = rest.slice(1);
    }
  }
  if (out === '' || out.endsWith(' ') || out.endsWith('\n')) rest = trimSpacesStart(rest);
  return [out, rest];
}

const BREAKS = ' \t\r\n';

/**
 * True when the id sits in a link, a path or an email address: the word around it (back and forward to
 * the nearest space) has a slash or an "@", or it is a query value or a fragment.
 */
function isInsideAddress(before: string, after: string): boolean {
  let start = before.length;
  while (start > 0 && !BREAKS.includes(before.charAt(start - 1))) start -= 1;
  let end = 0;
  while (end < after.length && !BREAKS.includes(after.charAt(end))) end += 1;
  const word = before.slice(start).toLowerCase() + after.slice(0, end).toLowerCase();
  const prev = before.charAt(before.length - 1);
  return (
    word.includes('/') ||
    word.includes('@') ||
    word.startsWith('www.') ||
    prev === '=' ||
    prev === '#'
  );
}

/**
 * The text with machine ids removed: cuids and UUIDs, and the label in front of one ("COA ledger row",
 * "lead id"). An id inside an address (a path, a query value or a fragment) stays, so the link still
 * works. Text without an id is returned unchanged.
 */
export function stripMachineIds(text: string): string {
  let out = '';
  let rest = text;
  for (let found = firstId(rest); found; found = firstId(rest)) {
    const end = found.index + found.length;
    if (isInsideAddress(out + rest.slice(0, found.index), rest.slice(end))) {
      out += rest.slice(0, end);
      rest = rest.slice(end);
      continue;
    }
    out = withoutTrailingLabels(out + rest.slice(0, found.index));
    [out, rest] = closeGap(out, rest.slice(end));
  }
  const result = out + rest;
  return result === text ? text : result.trim();
}

/** True when the text carries a machine id. */
export function hasMachineId(text: string): boolean {
  return stripMachineIds(text) !== text;
}

/** An activity's title and description, cleaned; a title that was only an id becomes a neutral one. */
export function cleanActivityText(activity: { title: string; description?: string | null }): {
  title: string;
  description: string;
} {
  return {
    title: stripMachineIds(activity.title) || FALLBACK_ACTIVITY_TITLE,
    description: stripMachineIds(activity.description ?? ''),
  };
}
