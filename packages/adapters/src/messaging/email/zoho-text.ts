/**
 * Zoho Mail text parsing for reply sync (MVP-001), split out of the reader (zoho-mail-reader.ts):
 * the addresses in Zoho's HTML-escaped address fields, a sender's display name, and a message body
 * as plain text.
 */

/**
 * The HTML entities Zoho escapes text with, decoded in one pass. `&amp;` goes last, so a literal
 * `&amp;lt;` comes out as the text `&lt;`, never as a '<' that would read as markup.
 */
export function decodeEntities(text: string): string {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

/** A token without the single quotes around it. */
function trimQuotes(token: string): string {
  let start = 0;
  let end = token.length;
  while (start < end && token[start] === "'") start++;
  while (end > start && token[end - 1] === "'") end--;
  return token.slice(start, end);
}

/** An address-shaped token, lower case; an apostrophe belongs to it (o'neil@…) unless it wraps it. */
function asAddress(token: string): string | null {
  const value = trimQuotes(token.trim()).toLowerCase();
  const at = value.indexOf('@');
  const ok = at > 0 && at === value.lastIndexOf('@') && value.slice(at + 1).includes('.');
  return ok && !/[\s<>"]/.test(value) ? value : null;
}

/**
 * The entries of an address field, split on commas and semicolons (outside double quotes when
 * `honourQuotes`). `open` is true when a quote was left unclosed.
 */
function splitEntries(text: string, honourQuotes: boolean): { entries: string[]; open: boolean } {
  const entries: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of text) {
    if (honourQuotes && char === '"') quoted = !quoted;
    if (!quoted && (char === ',' || char === ';')) {
      entries.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  entries.push(current);
  return { entries, open: quoted };
}

/**
 * The entries of an address field. A display name with one unmatched quote would turn quoting on
 * for the rest of the field and swallow the recipients after it, so then the field is split again
 * without quote handling.
 */
function addressEntries(text: string): string[] {
  const quoted = splitEntries(text, true);
  return quoted.open ? splitEntries(text, false).entries : quoted.entries;
}

/**
 * The addresses of one entry. With an angle-bracket part (`"Name" <a@b>`) only that part counts:
 * an address written in the display name is never taken as the sender or a recipient.
 */
function entryAddresses(entry: string): string[] {
  const open = entry.lastIndexOf('<');
  const close = open === -1 ? -1 : entry.indexOf('>', open);
  if (close > open) {
    const address = asAddress(entry.slice(open + 1, close));
    return address ? [address] : [];
  }
  return entry
    .split(/[\s"]+/)
    .map(asAddress)
    .filter((a): a is string => a !== null);
}

/** Every address in a Zoho address field (plain, comma-separated, or "Name" <a@b>, HTML-escaped). */
export function zohoAddresses(field: string | null | undefined): string[] {
  return [...new Set(addressEntries(decodeEntities(field ?? '')).flatMap(entryAddresses))];
}

/** The display name in `"Name" <a@b>`, if any. */
export function displayName(field: string | null | undefined): string | null {
  const text = decodeEntities(field ?? '');
  const at = text.indexOf('<');
  const name = (at > 0 ? text.slice(0, at) : '').replaceAll('"', '').trim();
  return name || null;
}

/** Tags that end a line: a break, or the end of a block. */
const LINE_TAGS = new Set(['br', '/p', '/div', '/li', '/tr']);
const SKIP_TAGS = new Set(['script', 'style']);

/** The tag name at `html[start]` (just after '<'), lower case, with a leading '/' kept. */
function tagName(html: string, start: number): string {
  let end = start;
  while (end < html.length && /[\w/]/.test(html[end]!)) end++;
  return html.slice(start, end).toLowerCase();
}

/** Where the end tag `</name` starts at or after `from`, any case (-1 when there is none). */
function endTagAt(html: string, name: string, from: number): number {
  const pattern = new RegExp(`</${name}`, 'gi');
  pattern.lastIndex = from;
  return pattern.exec(html)?.index ?? -1;
}

/** Tags out in one linear pass: line-break tags become new lines, script and style are skipped. */
function stripTags(html: string): string {
  let out = '';
  let i = 0;
  let close = -1; // the next '>' found, reused while it is still ahead (keeps the pass linear)
  while (i < html.length) {
    const open = html.indexOf('<', i);
    if (open === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, open);
    if (close <= open) close = html.indexOf('>', open + 1);
    // No '>' left: every '<' from here is text ("price < 100" in a plain-text body).
    if (close === -1) {
      out += html.slice(open);
      break;
    }
    const tag = readTag(html, open, close);
    out += tag.text;
    i = tag.next;
  }
  return out;
}

/**
 * The '<' at `open` (its '>' at `close`): the text it leaves and where reading goes on. A '<' that
 * starts no tag is text; a line-break tag leaves a new line; script and style are skipped whole.
 */
function readTag(html: string, open: number, close: number): { text: string; next: number } {
  if (!/[a-z/!]/i.test(html[open + 1] ?? '')) return { text: '<', next: open + 1 };
  const name = tagName(html, open + 1);
  const text = LINE_TAGS.has(name.replace(/\/$/, '')) ? '\n' : '';
  if (!SKIP_TAGS.has(name)) return { text, next: close + 1 };
  const endTag = endTagAt(html, name, close + 1);
  const after = endTag === -1 ? -1 : html.indexOf('>', endTag);
  return { text, next: after === -1 ? html.length : after + 1 };
}

/** Text from Zoho's HTML body: tags out, entities for the common characters, NUL removed. */
export function zohoBodyText(html: string, maxChars: number): string {
  const text = decodeEntities(stripTags(html))
    .replaceAll('\u0000', '')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, maxChars);
}
