/**
 * Secret deny-list for the whole-workspace export (agreement clause 5).
 *
 * The export hands a leaving customer a standalone copy of THEIR data. It must never carry a
 * credential, whoever the credential belongs to. Four layers, each with a test:
 *
 *  1. EXPLICIT_SECRET_DENYLIST: every schema column known to hold a secret, a hash of one, or a
 *     token. None of these models is exported at all (a test pins that), and a test fails when
 *     a listed column is renamed away, so the list cannot silently go stale.
 *  2. EXPORTED_COLUMN_EXCLUSIONS: columns withheld from a model that IS exported.
 *  3. A name pattern over every exported column. A new column that looks like a secret and is
 *     neither excluded nor in REVIEWED_NON_SECRET makes the deny-list test fail, so a human
 *     decides before it can ship in a customer's archive.
 *  4. Json values: any key that looks like a secret is replaced by REDACTED before writing, and
 *     URL columns lose their query string (a signed link carries its token there).
 */

export const REDACTED = '[redacted]';

/** Column names that look like secrets. Case-insensitive, matched anywhere in the name. */
export const SECRET_COLUMN_PATTERN =
  /(token|secret|passw|hash|salt|credential|authoriz|bearer|byok|encrypt|cipher|otp|cookie|nonce|signature|(api|private|secret|access|signing|encryption|auth)_?key)/i;

/** Keys inside Json values that look like secrets. */
export const SECRET_JSON_KEY_PATTERN =
  /(token|secret|passw|credential|authoriz|bearer|cookie|(api|private|secret|access|signing|encryption|auth)[_-]?key)/i;

/**
 * Schema columns known to hold secrets. Keyed by Prisma model. These models are never exported;
 * the test in __tests__/deny-list.test.ts checks both facts.
 */
export const EXPLICIT_SECRET_DENYLIST: Readonly<Record<string, readonly string[]>> = {
  // OAuth / mailbox credentials and calendar sync cursors.
  EmailMailbox: [
    'smtpPassword',
    'imapPassword',
    'refreshToken',
    'tokenVersion',
    'calendarSyncToken',
  ],
  EmailOAuthState: ['stateHash'],
  // Auth sessions, MFA.
  Session: ['refreshToken'],
  UserMfaSettings: ['totpSecret'],
  // API keys (hash of the key) and webhook signing secrets.
  APIKey: ['keyHash'],
  PartnerApiKey: ['keyHash'],
  WebhookEndpoint: ['secret'],
  // Privacy request tokens and anti-abuse hashes.
  DsarRequest: ['verificationTokenHash', 'exportTokenHash', 'capEmailHash', 'ipHash'],
  DsarTransfer: ['tokenHash'],
  BookingAttempt: ['emailHash', 'ipHash'],
};

/** Columns withheld from exported models: `Model` -> columns. */
export const EXPORTED_COLUMN_EXCLUSIONS: Readonly<Record<string, readonly string[]>> = {
  // A recording link can be a pre-signed URL; the customer's call log keeps duration/outcome.
  CallRecord: ['recordingUrl'],
  // The customer's own automation rules are theirs; only the webhook credentials stay out.
  TaskAutomationRule: [
    'webhookTokenHash',
    'webhookTokenPrefix',
    'webhookSecret',
    'webhookSecretPrevious',
    'webhookSecretPreviousExpiresAt',
  ],
};

/**
 * Exported columns whose name matches the secret pattern but which are not secrets, with the
 * reason. `*.column` matches the column on every model.
 */
export const REVIEWED_NON_SECRET: Readonly<Record<string, string>> = {
  '*.colorToken': 'design token naming a tag colour',
  'CaseDocument.contentHash': 'SHA-256 of the stored file, an integrity check the customer wants',
  'CaseDocument.signatureHash': 'digest of a signed document, part of its legal record',
  'CaseDocument.signatureIpAddress': 'where a document was signed, part of its legal record',
  'CaseDocument.signatureUserAgent': 'what signed a document, part of its legal record',
};

/** Whether `model.column` is reviewed as non-secret. */
export function isReviewedNonSecret(model: string, column: string): boolean {
  return `${model}.${column}` in REVIEWED_NON_SECRET || `*.${column}` in REVIEWED_NON_SECRET;
}

/** Columns of `model` that an export must leave out. */
export function excludedColumns(model: string): readonly string[] {
  return EXPORTED_COLUMN_EXCLUSIONS[model] ?? [];
}

/**
 * The columns that would be exported for `model` (all of `allColumns` minus exclusions) and look
 * like secrets without being reviewed. An empty result means the model is safe to export.
 */
export function unreviewedSecretLikeColumns(
  model: string,
  allColumns: readonly string[]
): string[] {
  const excluded = new Set(excludedColumns(model));
  return allColumns.filter(
    (c) => !excluded.has(c) && SECRET_COLUMN_PATTERN.test(c) && !isReviewedNonSecret(model, c)
  );
}

const isContainer = (v: unknown): v is object =>
  v !== null && typeof v === 'object' && !(v instanceof Date);

type ScrubFrame = { src: object; dst: object };

/** The scrubbed copy of one value; a container is copied empty and queued to be filled. */
function scrubChild(key: string, v: unknown, inArray: boolean, stack: ScrubFrame[]): unknown {
  if (!inArray && SECRET_JSON_KEY_PATTERN.test(key)) return REDACTED;
  if (!isContainer(v)) return v;
  const dst = Array.isArray(v) ? [] : {};
  stack.push({ src: v, dst });
  return dst;
}

/**
 * Replace the value of every secret-looking key in a Json value (deep copy). Walks with an
 * explicit stack, so a value of any depth is kept as it is: nothing is cut off or replaced for
 * being deeply nested.
 */
export function scrubJson(value: unknown): unknown {
  if (!isContainer(value)) return value;
  const root: object = Array.isArray(value) ? [] : {};
  const stack: ScrubFrame[] = [{ src: value, dst: root }];
  while (stack.length > 0) {
    const { src, dst } = stack.pop()!;
    const inArray = Array.isArray(src);
    const entries: Array<[string, unknown]> = inArray
      ? (src as unknown[]).map((v, i) => [String(i), v])
      : Object.entries(src as Record<string, unknown>);
    for (const [k, v] of entries) {
      // defineProperty: a plain assignment to "__proto__" would hit the prototype setter and
      // silently drop the customer's key.
      Object.defineProperty(dst, k, {
        value: scrubChild(k, v, inArray, stack),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return root;
}

/** A URL without query string or fragment: signed links carry their token there. */
export function stripUrlSecrets(value: string): string {
  const cut = value.search(/[?#]/);
  const base = cut === -1 ? value : value.slice(0, cut);
  // Credentials in the address go too (the user information before the host, with or without a
  // scheme). As in the URL standard, the authority ends at the first slash and the user
  // information is everything before its LAST at-sign, so a password that itself holds an
  // at-sign is removed whole.
  const prefix = /^(?:[a-z][a-z0-9+.-]{0,30}:)?\/\//i.exec(base)?.[0];
  if (!prefix) return base;
  let end = prefix.length;
  while (end < base.length && base[end] !== '/') end += 1;
  const authority = base.slice(prefix.length, end);
  const at = authority.lastIndexOf('@');
  return at === -1 ? base : prefix + authority.slice(at + 1) + base.slice(end);
}
