/**
 * A name a downloaded attachment is saved under. The sender chooses the name, so: no path or
 * control characters, no bidirectional or zero-width marks that could make `invoice<RLO>fdp.exe`
 * read as `invoice.pdf`, no trailing dots or spaces (Windows drops them), and no reserved
 * Windows device names.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const FORBIDDEN = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

function isHiddenMark(code: number): boolean {
  return (
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  );
}

const MAX_LENGTH = 200;
const MAX_EXTENSION = 16;

/** Drops trailing dots and spaces (Windows ignores them, which can change the extension). */
function trimEnd(name: string): string {
  let end = name.length;
  while (end > 0 && (name[end - 1] === '.' || name[end - 1] === ' ')) end -= 1;
  return name.slice(0, end);
}

/**
 * Shortens a long name. A short final extension is kept and the stem is cut. With none, every dot
 * of the cut name becomes `_`: cutting from the end could otherwise leave an inner `.exe` as the
 * extension the file is saved under.
 */
function shorten(name: string): string {
  if (name.length <= MAX_LENGTH) return name;
  const dot = name.lastIndexOf('.');
  if (dot > 0 && name.length - dot <= MAX_EXTENSION) {
    const extension = name.slice(dot);
    return trimEnd(name.slice(0, dot).slice(0, MAX_LENGTH - extension.length)) + extension;
  }
  return trimEnd(name.slice(0, MAX_LENGTH).replaceAll('.', '_'));
}

export function saveName(name: string): string {
  const cleaned = [...name]
    .filter((char) => !isHiddenMark(char.codePointAt(0) ?? 0))
    .map((char) => (char.charCodeAt(0) < 32 || FORBIDDEN.has(char) ? '_' : char))
    .join('');
  const trimmed = shorten(trimEnd(cleaned));
  if (!trimmed) return 'attachment';
  return WINDOWS_RESERVED.test(trimmed) ? `_${trimmed}` : trimmed;
}
