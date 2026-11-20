/**
 * User-facing activity text without the machine id the COA sync writes into it (register row 42).
 *
 * The operator script that logs COA outreach on a lead wrote "... COA ledger row <record id>." into the
 * description. A user cannot use that id and it reads as a leak of internals; the id belongs in the activity's
 * metadata. Only that exact form is removed: the words "COA ledger row", a record id (a cuid: "c" and at least 20
 * letters or digits, one of them a digit) and the full stop after it. Nothing else is touched, so an id a person
 * typed, a link, a path, a file name or an address is never changed.
 *
 * Pure, browser safe and without backtracking patterns: the API uses it when an activity is written, the web when
 * one is shown, and the one-off cleanup script for rows written before.
 */

/** What a title becomes when it was nothing but an id. */
export const FALLBACK_ACTIVITY_TITLE = 'Activity';

const LEDGER_MARKER = 'coa ledger row';

function isAlphanumeric(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9')
  );
}

/**
 * The index of the next "COA ledger row" at or after `from`, ignoring case, that starts a word. It compares slice by
 * slice rather than searching a lower-cased copy, so an index never shifts when a character changes length in lower
 * case.
 */
function findMarker(text: string, from: number): number {
  for (let at = from; at + LEDGER_MARKER.length <= text.length; at += 1) {
    const startsWord = at === 0 || !isAlphanumeric(text.charAt(at - 1));
    if (startsWord && text.slice(at, at + LEDGER_MARKER.length).toLowerCase() === LEDGER_MARKER) {
      return at;
    }
  }
  return -1;
}

/** The end of the record id that follows the marker ending at `from` (after spaces), or -1 when there is none. */
function recordIdEnd(text: string, from: number): number {
  let start = from;
  while (text.charAt(start) === ' ' || text.charAt(start) === '\t') start += 1;
  let end = start;
  while (end < text.length && isAlphanumeric(text.charAt(end))) end += 1;
  const id = text.slice(start, end);
  const isId = id.length >= 21 && id.charAt(0).toLowerCase() === 'c' && /\d/.test(id);
  return isId ? end : -1;
}

function trimSpacesEnd(text: string): string {
  let end = text.length;
  while (end > 0 && (text.charAt(end - 1) === ' ' || text.charAt(end - 1) === '\t')) end -= 1;
  return text.slice(0, end);
}

function trimSpacesStart(text: string): string {
  let start = 0;
  while (start < text.length && (text.charAt(start) === ' ' || text.charAt(start) === '\t'))
    start += 1;
  return text.slice(start);
}
/** The text without "COA ledger row <id>." (the full stop after the id goes with it). Other text is unchanged. */
export function stripMachineIds(text: string): string {
  let out = '';
  let from = 0;
  let removed = false;
  for (let at = findMarker(text, from); at >= 0; at = findMarker(text, from)) {
    const after = at + LEDGER_MARKER.length;
    let end = recordIdEnd(text, after);
    if (end < 0) {
      out += text.slice(from, after);
      from = after;
      continue;
    }
    if (text.charAt(end) === '.') end += 1;
    out += trimSpacesEnd(text.slice(from, at));
    from = end;
    removed = true;
  }
  if (!removed) return text;
  // Only the gap the removal left is closed: one space between what stays on each side, none at an end or a line break.
  const rest = trimSpacesStart(text.slice(from));
  const glue = out === '' || rest === '' || out.endsWith('\n') || rest.startsWith('\n') ? '' : ' ';
  return (out + glue + rest).trim();
}

/** True when the whole text is one record id: a cuid (with a digit) or a UUID. */
export function isRecordId(text: string): boolean {
  if (text.length === 36) {
    const dashes = [8, 13, 18, 23].every((at) => text.charAt(at) === '-');
    return (
      dashes && [...text].every((char) => char === '-' || '0123456789abcdefABCDEF'.includes(char))
    );
  }
  return (
    text.length === 25 &&
    text.charAt(0).toLowerCase() === 'c' &&
    [...text].every(isAlphanumeric) &&
    /\d/.test(text)
  );
}

/** True when the text carries the COA ledger row id, or is one record id and nothing else. */
export function hasMachineId(text: string): boolean {
  return stripMachineIds(text) !== text || isRecordId(text.trim());
}

/** An activity's title and description, cleaned; a title that was only an id becomes a neutral one. */
export function cleanActivityText(activity: { title: string; description?: string | null }): {
  title: string;
  description: string;
} {
  const title = stripMachineIds(activity.title);
  return {
    title: title === '' || isRecordId(title.trim()) ? FALLBACK_ACTIVITY_TITLE : title,
    description: stripMachineIds(activity.description ?? ''),
  };
}
