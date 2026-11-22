#!/usr/bin/env node
/**
 * IFC-035 live sandbox proof, transport A (Meta WhatsApp Cloud API).
 *
 * STATUS WITHOUT CREDENTIALS: PENDING. Nothing is invented: with no credentials this script records
 * PENDING and which variable names are missing (names only, never values), then exits 2.
 *
 * Owner setup (his login, see docs/shared/whatsapp-api-research.md section 9), then export:
 *   META_WA_ACCESS_TOKEN        temporary or system-user token from the app dashboard (API Setup)
 *   META_WA_PHONE_NUMBER_ID     the TEST business phone number id shown in API Setup
 *   META_WA_RECIPIENT_E164      the owner's own phone, added and verified as a recipient, digits only
 *   META_WA_APP_SECRET          App settings, Basic, App secret (to verify webhook signatures)
 *   META_GRAPH_VERSION          optional, the version the dashboard shows; unversioned calls if unset
 *
 * With credentials it makes two provider calls and sends ONE message from the test number to the
 * owner's own phone:
 *   1. GET  /{phone-number-id}?fields=display_phone_number,verified_name,name_status,quality_rating,
 *           code_verification_status,messaging_limit_tier   (the number is real and readable)
 *   2. POST /{phone-number-id}/messages  template "hello_world" to the recipient  (the send path works;
 *           test numbers need no payment method for templates, per Meta's overview page)
 *   3. With --verify <rawBodyFile> <headerValue>, a webhook body captured from the callback and its
 *      X-Hub-Signature-256 header are checked: "sha256=" + HMAC-SHA256(app secret, raw body).
 *
 * Offline self-test (always runs, labelled SIMULATED): the signature algorithm against a locally built
 * body. It proves the verification code, not Meta.
 *
 * Usage: node infra/whatsapp-meta/sandbox-proof.mjs [--verify <rawBodyFile> <headerValue>]
 * Writes artifacts/misc/meta-sandbox-proof.json and merges artifacts/misc/poc-results.json.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const miscDir = path.join(repoRoot, 'artifacts', 'misc');
const env = process.env;
const REQUIRED = [
  'META_WA_ACCESS_TOKEN',
  'META_WA_PHONE_NUMBER_ID',
  'META_WA_RECIPIENT_E164',
  'META_WA_APP_SECRET',
];
const missing = REQUIRED.filter((n) => !env[n]);

export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!appSecret) return 'MISSING_SECRET';
  if (!header) return 'MISSING_SIGNATURE';
  if (!header.startsWith('sha256=')) return 'MALFORMED_SIGNATURE';
  const got = Buffer.from(header.slice(7), 'utf8');
  const want = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'), 'utf8');
  if (got.length !== want.length) return 'MALFORMED_SIGNATURE';
  return timingSafeEqual(got, want) ? null : 'SIGNATURE_MISMATCH';
}

const result = {
  task: 'IFC-035',
  transport: 'META_CLOUD',
  generatedAt: new Date().toISOString(),
  status: 'PENDING',
  pendingReason: null,
  ownerStep: null,
  missingEnvNames: missing,
  simulated: { label: 'SIMULATED, not Meta: signature algorithm self-test', checks: [] },
  live: { readNumber: null, sendTemplate: null, webhookSignature: null },
};

// offline self-test with a throwaway secret built at runtime
{
  const secret = 'self'.repeat(8);
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  const good = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  const changed = Buffer.concat([body, Buffer.from(' ')]);
  const cases = [
    ['right signature', verifyMetaSignature(body, good, secret), null],
    ['wrong secret', verifyMetaSignature(body, good, 'x'.repeat(32)), 'SIGNATURE_MISMATCH'],
    ['no header', verifyMetaSignature(body, undefined, secret), 'MISSING_SIGNATURE'],
    ['no secret', verifyMetaSignature(body, good, ''), 'MISSING_SECRET'],
    ['no sha256= prefix', verifyMetaSignature(body, good.slice(7), secret), 'MALFORMED_SIGNATURE'],
    ['body changed', verifyMetaSignature(changed, good, secret), 'SIGNATURE_MISMATCH'],
  ];
  result.simulated.checks = cases.map(([label, got, expected]) => ({
    label,
    got,
    expected,
    pass: got === expected,
  }));
}

let exit = 2;
if (missing.length > 0) {
  result.pendingReason = 'No Meta developer app, test number or token exists on this machine.';
  result.ownerStep =
    'Owner: log in to developers.facebook.com, create an app with the WhatsApp use case, open API Setup, add his own phone as a recipient, export the four META_WA_* variables listed in this script header, and run this script.';
} else {
  const ver = env.META_GRAPH_VERSION ? `/${env.META_GRAPH_VERSION}` : '';
  const g = (p, init = {}) =>
    fetch(`https://graph.facebook.com${ver}${p}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.META_WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    });
  const scrub = (t) => String(t).split(env.META_WA_ACCESS_TOKEN).join('<redacted>').slice(0, 600);
  try {
    const fields =
      'display_phone_number,verified_name,name_status,quality_rating,code_verification_status,messaging_limit_tier';
    const r1 = await g(`/${env.META_WA_PHONE_NUMBER_ID}?fields=${fields}`);
    result.live.readNumber = { status: r1.status, body: scrub(await r1.text()) };
    const r2 = await g(`/${env.META_WA_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: env.META_WA_RECIPIENT_E164,
        type: 'template',
        template: { name: 'hello_world', language: { code: 'en_US' } },
      }),
    });
    result.live.sendTemplate = {
      status: r2.status,
      body: scrub(await r2.text())
        .split(env.META_WA_RECIPIENT_E164)
        .join('<recipient>'),
    };
  } catch (e) {
    result.live.error = scrub(e.message);
  }
  const vi = process.argv.indexOf('--verify');
  if (vi > 0) {
    const raw = readFileSync(process.argv[vi + 1]);
    result.live.webhookSignature = {
      reason: verifyMetaSignature(raw, process.argv[vi + 2], env.META_WA_APP_SECRET),
    };
  }
  const ok =
    result.live.readNumber?.status === 200 &&
    result.live.sendTemplate?.status === 200 &&
    (vi < 0 || result.live.webhookSignature?.reason === null);
  result.status = ok ? 'PASSED' : 'FAILED';
  exit = ok ? 0 : 1;
}

mkdirSync(miscDir, { recursive: true });
writeFileSync(
  path.join(miscDir, 'meta-sandbox-proof.json'),
  JSON.stringify(result, null, 2) + '\n'
);

// merge both transports into poc-results.json
const wahaFile = path.join(miscDir, 'waha-sandbox-proof.json');
const waha = existsSync(wahaFile) ? JSON.parse(readFileSync(wahaFile, 'utf8')) : null;
const poc = {
  task: 'IFC-035',
  generatedAt: new Date().toISOString(),
  rule: 'Never invent results. PENDING means not run. SIMULATED means not the provider.',
  transports: {
    WAHA: waha
      ? { status: waha.allPassed ? 'PASSED_LOCAL' : 'FAILED', ...waha }
      : { status: 'NOT_RUN' },
    META_CLOUD: { ...result },
  },
};
writeFileSync(path.join(miscDir, 'poc-results.json'), JSON.stringify(poc, null, 2) + '\n');
console.log(
  JSON.stringify({
    meta: result.status,
    missingEnvNames: missing,
    simulatedAllPass: result.simulated.checks.every((c) => c.pass),
  })
);
process.exit(exit);
