#!/usr/bin/env node
/**
 * IFC-035 live sandbox proof, transport B (WAHA). Local only, no real WhatsApp number is paired.
 *
 * Proves, against a real WAHA container (infra/waha/compose.yaml, bound to 127.0.0.1):
 *   1. a session reaches SCAN_QR_CODE and the pairing QR endpoint answers (the QR itself is NOT stored);
 *   2. WAHA really delivers a webhook (session.status) to a local fake receiver, signed with the
 *      per-session HMAC key (X-Webhook-Hmac, sha512 over the raw body);
 *   3. the raw-body route behaviour: authentic bytes pass; a tampered body, a missing header, a wrong
 *      key, and a JSON body re-serialised before hashing are all rejected (fail closed, 401).
 *

 * The receiver listens on 0.0.0.0 for the run (about 30 s) because the container reaches it through host-gateway;
 * it answers only a random path token and fails closed on the HMAC. Set RECEIVER_HOST to narrow it.
 * The receiver is a stand-in for the API's raw-body route (apps/api, IFC-323/IFC-326). It is not the
 * adapter: it only shows what the real route must do with WAHA's real bytes.
 *
 * Usage: node infra/waha/sandbox-proof.mjs [--out artifacts/misc/waha-sandbox-proof.json]
 * Removes its container and volume by name at the end. Exit 0 only when every check passed.
 */
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const composeFile = path.join(here, 'compose.yaml');
const overrideFile = path.join(here, 'compose.proof.yaml');
const outIdx = process.argv.indexOf('--out');
const outFile =
  outIdx > 0
    ? path.resolve(process.argv[outIdx + 1])
    : path.join(repoRoot, 'artifacts', 'misc', 'waha-sandbox-proof.json');
const CONTAINER = 'ifc322-waha-a';
const PORT = process.env.WAHA_PORT ?? '3335';
const RECEIVER_PORT = Number(process.env.RECEIVER_PORT ?? 3336);
const BASE = `http://127.0.0.1:${PORT}`;

const adminKey = randomBytes(24).toString('hex');
const hmacKey = randomBytes(24).toString('hex');
const pathToken = randomBytes(12).toString('hex');
const session = `proof-${randomBytes(3).toString('hex')}`;
const redact = (t) =>
  String(t).split(adminKey).join('<redacted>').split(hmacKey).join('<redacted>');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, env = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env }, windowsHide: true });

async function waha(method, p, body) {
  try {
    const res = await fetch(`${BASE}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': adminKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, type: res.headers.get('content-type'), buf };
  } catch (e) {
    return {
      status: 0,
      type: null,
      buf: Buffer.from(`network error: ${e.cause?.code ?? e.message}`),
    };
  }
}
const asJson = (r) => {
  try {
    return JSON.parse(r.buf.toString('utf8'));
  } catch {
    return null;
  }
};

// ---- the fake receiver: a raw-body route, fail closed -------------------------------------------
const deliveries = []; // real WAHA deliveries (authentic only)
const rejections = []; // reason codes only, never the body
function verify(raw, headers, secret) {
  if (!secret) return 'MISSING_SECRET';
  const sig = headers['x-webhook-hmac'];
  if (!sig) return 'MISSING_SIGNATURE';
  if (String(headers['x-webhook-hmac-algorithm'] ?? '').toLowerCase() !== 'sha512')
    return 'MALFORMED_SIGNATURE';
  const want = createHmac('sha512', secret).update(raw).digest('hex');
  const got = Buffer.from(String(sig), 'utf8');
  const exp = Buffer.from(want, 'utf8');
  if (got.length !== exp.length) return 'MALFORMED_SIGNATURE'; // length check before timingSafeEqual
  return timingSafeEqual(got, exp) ? null : 'SIGNATURE_MISMATCH';
}
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks); // exact bytes, before any JSON parsing
    if (req.method !== 'POST' || req.url !== `/api/webhooks/whatsapp/waha/${pathToken}`) {
      res.writeHead(404).end();
      return;
    }
    const reason = verify(raw, req.headers, hmacKey);
    if (reason) {
      rejections.push({ reason, bytes: raw.length });
      res.writeHead(401).end(reason);
      return;
    }
    let event = null;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      /* authentic but not JSON: ignored */
    }
    deliveries.push({
      receivedAt: new Date().toISOString(),
      bytes: raw.length,
      event: event?.event ?? null,
      session: event?.session ?? null,
      engine: event?.engine ?? null,
      status: event?.payload?.status ?? null,
      headers: {
        'x-webhook-hmac': 'present, 128 hex chars',
        'x-webhook-hmac-algorithm': req.headers['x-webhook-hmac-algorithm'],
      },
      raw,
    });
    res.writeHead(200).end('ok');
  });
});

const post = async (body, headers) => {
  const r = await fetch(
    `http://127.0.0.1:${RECEIVER_PORT}/api/webhooks/whatsapp/waha/${pathToken}`,
    {
      method: 'POST',
      headers,
      body,
    }
  );
  return r.status;
};

const result = {
  task: 'IFC-035',
  transport: 'WAHA',
  generatedAt: new Date().toISOString(),
  note:
    'Local container, 127.0.0.1 only. No real WhatsApp number was paired; the session stops at SCAN_QR_CODE. ' +
    'The receiver is a local stand-in for the API raw-body route.',
  container: {},
  session: {},
  webhook: {},
  rawBodyChecks: [],
  cleanup: {},
  allPassed: false,
};

let exitCode = 1;
try {
  await new Promise((r) => server.listen(RECEIVER_PORT, process.env.RECEIVER_HOST ?? '0.0.0.0', r));

  const up = run('docker', ['compose', '-f', composeFile, '-f', overrideFile, 'up', '-d'], {
    WAHA_ADMIN_KEY: adminKey,
    WAHA_PORT: PORT,
  });
  if (up.status !== 0) throw new Error(`compose up failed: ${redact(up.stderr)}`);
  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    const r = await waha('GET', '/api/version');
    if (r.status === 200) version = asJson(r);
    else await sleep(1000);
  }
  if (!version) throw new Error('WAHA not ready in 60 s');
  const bind = JSON.parse(run('docker', ['inspect', CONTAINER]).stdout)[0]?.HostConfig
    ?.PortBindings;
  result.container = {
    name: CONTAINER,
    waha: version,
    portBindings: Object.fromEntries(
      Object.entries(bind ?? {}).map(([k, v]) => [k, v.map((b) => `${b.HostIp}:${b.HostPort}`)])
    ),
  };

  // create + start a session whose webhook points at the local receiver (host.docker.internal)
  const hookUrl = `http://host.docker.internal:${RECEIVER_PORT}/api/webhooks/whatsapp/waha/${pathToken}`;
  const created = await waha('POST', '/api/sessions', {
    name: session,
    start: true,
    config: {
      webhooks: [
        {
          url: hookUrl,
          events: ['session.status', 'message'],
          hmac: { key: hmacKey },
          retries: { policy: 'constant', delaySeconds: 2, attempts: 3 },
        },
      ],
    },
  });
  result.session.createStatus = created.status;

  // 1. SCAN_QR_CODE
  let state = null;
  for (let i = 0; i < 40; i++) {
    const r = await waha('GET', `/api/sessions/${session}`);
    state = asJson(r);
    if (state?.status === 'SCAN_QR_CODE') break;
    await sleep(1000);
  }
  result.session.status = state?.status ?? null;
  result.session.engine = state?.engine?.engine ?? null;
  result.session.paired = state?.me != null;
  const qr = await waha('GET', `/api/${session}/auth/qr`);
  result.session.qrEndpoint = {
    status: qr.status,
    contentType: qr.type,
    bytes: qr.buf.length,
    stored: false,
  };

  // 2. real signed deliveries from WAHA to the fake
  for (let i = 0; i < 20 && deliveries.length === 0; i++) await sleep(1000);
  result.webhook = {
    realDeliveriesAccepted: deliveries.length,
    sample: deliveries.map(({ raw, ...d }) => d).slice(0, 3),
    rejectedDuringRun: [...rejections],
  };

  // 3. raw-body behaviour, using the exact bytes WAHA sent
  const real = deliveries[0]?.raw;
  if (real) {
    const good = createHmac('sha512', hmacKey).update(real).digest('hex');
    const H = (sig, alg = 'sha512') => ({
      'Content-Type': 'application/json',
      ...(sig ? { 'X-Webhook-Hmac': sig } : {}),
      'X-Webhook-Hmac-Algorithm': alg,
    });
    const tampered = Buffer.concat([real, Buffer.from(' ')]);
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(real.toString('utf8')), null, 2));
    const checks = [
      ['authentic bytes, right signature', real, H(good), 200],
      [
        'replayed authentic delivery (route accepts; idempotency is the ingest use case, IFC-324)',
        real,
        H(good),
        200,
      ],
      ['body changed by one byte, original signature', tampered, H(good), 401],
      ['no signature header', real, H(null), 401],
      ['wrong key', real, H(createHmac('sha512', 'x'.repeat(24)).update(real).digest('hex')), 401],
      ['signature of the wrong length', real, H(good.slice(0, 64)), 401],
      ['wrong algorithm header', real, H(good, 'sha256'), 401],
      [
        'JSON re-serialised (pretty-printed) before verifying, original signature',
        reserialised,
        H(good),
        401,
      ],
      ['wrong path token', real, H(good), 404],
    ];
    for (const [label, body, headers, expect] of checks) {
      let status;
      if (label === 'wrong path token') {
        status = (
          await fetch(
            `http://127.0.0.1:${RECEIVER_PORT}/api/webhooks/whatsapp/waha/${'0'.repeat(24)}`,
            {
              method: 'POST',
              headers,
              body,
            }
          )
        ).status;
      } else status = await post(body, headers);
      result.rawBodyChecks.push({ label, expected: expect, status, pass: status === expect });
    }
  }

  const ok =
    result.session.status === 'SCAN_QR_CODE' &&
    result.session.paired === false &&
    result.session.qrEndpoint.status === 200 &&
    result.webhook.realDeliveriesAccepted >= 1 &&
    result.rawBodyChecks.length > 0 &&
    result.rawBodyChecks.every((c) => c.pass);
  result.allPassed = ok;
  exitCode = ok ? 0 : 1;
} catch (e) {
  result.error = redact(e.message);
} finally {
  server.close();
  const down = run('docker', ['compose', '-f', composeFile, '-f', overrideFile, 'down', '-v'], {
    WAHA_ADMIN_KEY: 'x',
  });
  const left = run('docker', [
    'ps',
    '-a',
    '--filter',
    `name=${CONTAINER}`,
    '--format',
    '{{.Names}}',
  ]);
  result.cleanup = { composeDownExit: down.status, containerLeft: left.stdout.trim() !== '' };
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, redact(JSON.stringify(result, null, 2)) + '\n');
  console.log(redact(JSON.stringify(result, null, 2)));
}
process.exit(exitCode);
