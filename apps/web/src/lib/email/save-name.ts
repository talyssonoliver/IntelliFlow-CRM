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

/** Shortens the stem, never the final extension: cutting from the end could leave an inner `.exe` as the one the file is saved under. */
function shorten(name: string): string {
  if (name.length <= MAX_LENGTH) return name;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && name.length - dot <= MAX_EXTENSION ? name.slice(dot) : '';
  const stem = extension ? name.slice(0, dot) : name;
  return stem.slice(0, MAX_LENGTH - extension.length) + extension;
}

export function saveName(name: string): string {
  const cleaned = [...name]
    .filter((char) => !isHiddenMark(char.codePointAt(0) ?? 0))
    .map((char) => (char.charCodeAt(0) < 32 || FORBIDDEN.has(char) ? '_' : char))
    .join('');
  let end = cleaned.length;
  while (end > 0 && (cleaned[end - 1] === '.' || cleaned[end - 1] === ' ')) end -= 1;
  const trimmed = shorten(cleaned.slice(0, end));
  if (!trimmed) return 'attachment';
  return WINDOWS_RESERVED.test(trimmed) ? `_${trimmed}` : trimmed;
}
