/**
 * E.164 normalisation for the WhatsApp channel (IFC-320).
 *
 * Pure string handling, no libraries. The existing `PhoneNumber` value object
 * assumes a US default region; this channel serves UK businesses (design doc
 * section 6: "E.164, UK default region") and must also read the digit-only and
 * `@c.us` forms providers send, so it has its own normaliser.
 */

/**
 * `+`, a non-zero first digit, 7 to 15 digits in total (E.164 allows up to 15; the shortest
 * real plans, such as Niue's 4-digit subscriber numbers, give 7). Structural only: no per-country check.
 */
export const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

/** Calling code used for numbers typed in national form (leading 0). */
export const DEFAULT_COUNTRY_CALLING_CODE = '44';

export interface NormalizeE164Options {
  /**
   * Digits only, no `+`. Applied to national numbers that start with a single 0. Only meaningful for
   * countries whose national numbers start with a trunk 0 (UK, BR, ...); for a country such as Italy
   * a leading 0 belongs to the number and must be typed with "+".
   */
  defaultCountryCallingCode?: string;
}

/**
 * Calling codes whose national plan drops the trunk 0 when dialled internationally, so "+CC (0) ..." means
 * "+CC ...": UK 44, Germany 49, France 33, Netherlands 31, Australia 61, New Zealand 64, Switzerland 41,
 * Austria 43, Belgium 32, Ireland 353. Deliberately small; Italy (39, 378 and 379) keeps the zero and is NOT here.
 */
export const TRUNK_ZERO_DROPPED_CODES = [
  '44',
  '49',
  '33',
  '31',
  '61',
  '64',
  '41',
  '43',
  '32',
  '353',
] as const;

const TRUNK_BRACKET_AFTER_CODE = new RegExp(
  `^(?:\\+|00)\\s*(?:${TRUNK_ZERO_DROPPED_CODES.join('|')})\\s*\\(0\\)`
);

const TRUNK_ZERO_AFTER_CODE = new RegExp('^[+](?:' + TRUNK_ZERO_DROPPED_CODES.join('|') + ')0');

export function isE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

/** Only digits and the usual separators, one leading plus at most, brackets paired. */
function isTypedNumberShape(trimmed: string): boolean {
  // Tabs and newlines are not part of a typed number.
  if (!/^[\d ().+-]+$/.test(trimmed)) return false;
  if (trimmed.lastIndexOf('+') > 0) return false;
  // "+44 (7700 900123" is a typo, not a number.
  return (trimmed.match(/\(/g)?.length ?? 0) === (trimmed.match(/\)/g)?.length ?? 0);
}

/**
 * "+44 (0) 7700 ..." writes the trunk zero in brackets; it is not dialled abroad. That is only true for
 * the plans in TRUNK_ZERO_DROPPED_CODES. Elsewhere (Italy's +39 keeps the zero) or after an unknown code
 * the bracketed zero is ambiguous: null, rather than a guess. Returns the text without it otherwise.
 */
function stripTrunkBracket(trimmed: string): string | null {
  if (!/\(0\)/.test(trimmed)) return trimmed;
  if (!TRUNK_BRACKET_AFTER_CODE.test(trimmed)) return null;
  const stripped = trimmed.replace(/\(0\)/, '');
  return /\(0\)/.test(stripped) ? null : stripped;
}

/**
 * Turns a typed phone number into E.164, or null when it cannot be done safely.
 *
 * Accepts `+44 7700 900123`, `0044 7700 900123`, `07700 900123` (default region)
 * and `+44 (0) 7700 900123`. Anything with letters, a number without a `+`, `00`
 * or national `0` prefix, or a wrong length gives null: a guess here would send a
 * message to a stranger.
 */
export function normalizeE164(input: string, options: NormalizeE164Options = {}): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!isTypedNumberShape(trimmed)) return null;
  const withoutTrunk = stripTrunkBracket(trimmed);
  if (withoutTrunk === null) return null;
  const digits = withoutTrunk.replace(/\D/g, '');

  let candidate: string;
  if (withoutTrunk.startsWith('+')) {
    candidate = `+${digits}`;
  } else if (digits.startsWith('00')) {
    candidate = `+${digits.slice(2)}`;
  } else if (digits.startsWith('0')) {
    const code = options.defaultCountryCallingCode ?? DEFAULT_COUNTRY_CALLING_CODE;
    if (!/^[1-9]\d{0,2}$/.test(code)) return null;
    candidate = `+${code}${digits.slice(1)}`;
  } else {
    return null;
  }

  // No number in these plans has a 0 right after the code: "+44 07700..." keeps the trunk zero and would
  // dial a dead number. Reject rather than guess.
  if (TRUNK_ZERO_AFTER_CODE.test(candidate)) return null;

  return isE164(candidate) ? candidate : null;
}

/**
 * Meta sends the sender as digits with no plus (`wa_id`): always international.
 * Note for IFC-325: for a few countries (Brazil, Mexico, Argentina) the wa_id can differ from
 * the dialled number by a 9 or a 1, so contact matching should try both forms.
 */
export function e164FromWaId(waId: string): string | null {
  if (typeof waId !== 'string') return null;
  const candidate = `+${waId.trim()}`;
  return isE164(candidate) ? candidate : null;
}

const USER_CHAT_SUFFIXES = ['@c.us', '@s.whatsapp.net'];

/**
 * Number behind a WAHA / WhatsApp chat id, for 1:1 chats only. Groups (`@g.us`),
 * broadcast and status ids, and `@lid` ids (no phone number inside) give null.
 */
export function e164FromChatId(chatId: string): string | null {
  const id = chatId.trim().toLowerCase();
  const suffix = USER_CHAT_SUFFIXES.find((s) => id.endsWith(s));
  if (!suffix) return null;
  const local = id.slice(0, -suffix.length);
  // Linked-device ids look like "4477...:12@s.whatsapp.net"; the number is before ":".
  return e164FromWaId(local.split(':')[0] ?? '');
}
