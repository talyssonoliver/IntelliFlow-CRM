/**
 * User-facing activity text without machine identifiers (register row 42).
 *
 * Scripts and syncs that log activity on a lead sometimes put a system id in the text, for example
 * "... Pitshanger Health and Fitness. COA ledger row cmw5j72u40001p5ug01kf3vot." A user cannot use that id
 * and it reads as a leak of internals. The ids belong in an activity's metadata, never in its title or
 * description.
 *
 * Only an id that is introduced by a label is removed, together with the label ("COA ledger row <id>",
 * "lead id: <id>", "ref=<id>"), or an id that is the whole text. An id anywhere else (inside a link, a path, a file
 * name, a host name, an email address, a quoted value) is left exactly as written: nothing there is a label, and a
 * user's own text and addresses must never be changed.
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
  return word.includes('/') || word.includes('\\') || word.includes('@') || word.startsWith('www.');
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
      // A standalone word only: not the end of a longer word, a domain or a path ("/reference"),
      // and not a word that is itself a link, path or email ("?q=(reference").
      const boundary = lead === '' || WORD_STARTS.includes(lead);
      return boundary && !endsInsideAddress(head.slice(0, head.length - word.length));
    });
    if (!label) return out;
    out = head.slice(0, head.length - label.length);
  }
}

/** Brackets and quotes that are left empty when the id between them goes. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['"', '"'],
  ["'", "'"],
];

/** Closes the gap an id left: empty brackets, a space before punctuation, a doubled full stop. */
function closeGap(before: string, after: string): [string, string] {
  let out = before;
  let rest = after;
  if (PAIRS.some(([open, close]) => out.endsWith(open) && rest.startsWith(close))) {
    out = trimSpacesEnd(out.slice(0, -1));
    rest = rest.slice(1);
  }
  if (rest.startsWith('.') || rest.startsWith(',') || rest.startsWith(';')) {
    out = trimSpacesEnd(out);
    if (out === '' || out.endsWith('\n') || out.endsWith(rest.charAt(0))) {
      rest = rest.slice(1);
    }
  }
  if (out === '' || out.endsWith(' ') || out.endsWith('\n')) rest = trimSpacesStart(rest);
  return [out, rest];
}

const BREAKS = ' \t\r\n';
const CLOSERS = ')]}"\'';

function isBreakOrEnd(char: string): boolean {
  return char === '' || BREAKS.includes(char);
}

/** True when the token ends at `at` in `text`: a space or the end, or sentence punctuation then a space or the end. */
function tokenEndsAt(text: string, at: number): boolean {
  const char = text.charAt(at);
  if (isBreakOrEnd(char)) return true;
  return '.,;:!?'.includes(char) && isBreakOrEnd(text.charAt(at + 1));
}

/** The text before an id without the "=" of a "lead_id=<id>" assignment, so the label before it can be read. */
function beforeLabel(before: string): string {
  return before.endsWith('=') ? before.slice(0, -1) : before;
}

/** A quote opens after a space, a bracket, an "=", ":" or "," or the start of the line, and closes before a space, punctuation or the end. */
const QUOTE_OPENS_AFTER = ' \t\r\n([{=:,;';
const QUOTE_CLOSES_BEFORE = ' \t\r\n)]},.;:!?';

/**
 * True when the text ends inside a quoted value that is not ours to change ("Customer ref ...", 'C:\Exports\My
 * Files ref ...'). A quote mark inside a word (an apostrophe in "It's") is never a delimiter.
 */
function insideQuotedValue(text: string): boolean {
  const line = text;
  let open = '';
  for (let at = 0; at < line.length; at += 1) {
    const char = line.charAt(at);
    // An escaped quote (backslash before it) is part of the value, not a delimiter.
    if ((char !== '"' && char !== "'") || line.charAt(at - 1) === '\\') continue;
    if (open === '') {
      const prev = line.charAt(at - 1);
      if (at === 0 || QUOTE_OPENS_AFTER.includes(prev)) open = char;
    } else if (char === open) {
      const next = line.charAt(at + 1);
      if (next === '' || QUOTE_CLOSES_BEFORE.includes(next)) open = '';
    }
  }
  return open !== '';
}
/**
 * True when the line the id is on already holds a Windows path or a link before it ("Saved to C:\Exports\Customer ref
 * <id>"). A path may have spaces in it and the cleaner cannot tell where it ends, so nothing on that line is removed.
 */
function lineHasPathOrLink(before: string): boolean {
  const line = before.slice(before.lastIndexOf('\n') + 1);
  return line.includes('\\') || line.includes('://');
}
/**
 * True when the id is introduced by a label ("COA ledger row <id>", "lead_id=<id>", "ref: <id>") and the id's
 * token ends right after it (a closing bracket or quote counts, so "(ref <id>)." does), or when the id is the
 * whole text.
 */
function isRemovable(before: string, after: string): boolean {
  if (before.trim() === '' && after.trim() === '') return true;
  const base = beforeLabel(before);
  if (insideQuotedValue(base) || lineHasPathOrLink(base)) return false;
  if (withoutTrailingLabels(base).length >= base.length) return false;
  return CLOSERS.includes(after.charAt(0)) ? tokenEndsAt(after, 1) : tokenEndsAt(after, 0);
}

/**
 * The text with machine ids removed: cuids and UUIDs that a label introduces ("COA ledger row <id>", "lead id: <id>",
 * "ref=<id>"), together with the label, or an id that is the whole text. Any other id stays where it is, so a link,
 * path, file name, host name, email address or quoted value is never changed. Text without such an id is returned
 * unchanged.
 */
export function stripMachineIds(text: string): string {
  let out = '';
  let rest = text;
  for (let found = firstId(rest); found; found = firstId(rest)) {
    const end = found.index + found.length;
    const before = out + rest.slice(0, found.index);
    if (!isRemovable(before, rest.slice(end))) {
      out += rest.slice(0, end);
      rest = rest.slice(end);
      continue;
    }
    out = withoutTrailingLabels(beforeLabel(before));
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
