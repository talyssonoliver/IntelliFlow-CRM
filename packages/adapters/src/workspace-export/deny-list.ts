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
  TaskAutomationRule: [
    'webhookTokenHash',
    'webhookTokenPrefix',
    'webhookSecret',
    'webhookSecretPrevious',
  ],
  // Privacy request tokens and anti-abuse hashes.
  DsarRequest: ['verificationTokenHash', 'exportTokenHash', 'capEmailHash', 'ipHash'],
  BookingAttempt: ['emailHash', 'ipHash'],
};

/** Columns withheld from exported models: `Model` -> columns. */
export const EXPORTED_COLUMN_EXCLUSIONS: Readonly<Record<string, readonly string[]>> = {
  // A recording link can be a pre-signed URL; the customer's call log keeps duration/outcome.
  CallRecord: ['recordingUrl'],
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

/** Replace the value of every secret-looking key in a Json value (deep copy). */
export function scrubJson(value: unknown, depth = 0): unknown {
  if (depth > 20) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => scrubJson(v, depth + 1));
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_JSON_KEY_PATTERN.test(k) ? REDACTED : scrubJson(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** A URL without query string or fragment: signed links carry their token there. */
export function stripUrlSecrets(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}
