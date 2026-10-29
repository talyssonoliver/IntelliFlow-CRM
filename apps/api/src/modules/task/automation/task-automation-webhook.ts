/**
 * Task automation webhook trigger — PG-208 (ADR-084, owner ruling 1).
 *
 *   POST /api/webhooks/task-automation/<token>
 *   X-IntelliFlow-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + key + "." + body)>
 *   Idempotency-Key: <1..128 of [A-Za-z0-9._:-]>
 *
 * Mounted in `http-server.ts` BEFORE the global body read and the CORS layer.
 * Order: method → per-IP failure limiter → bounded body read (64 KB, 10 s) →
 * token format → rule lookup by token hash → per-rule failure limiter → secret
 * encrypted → signature (current secret, then the previous one inside its grace
 * window; the Idempotency-Key is signed, so a replay cannot pick a new key) →
 * per-rule caps
 * → JSON object → run insert. Every unknown/inactive/disabled/malformed token
 * gets the same 404, every signature or key failure the same 401, and nothing
 * is written for a rejected request. Never logs the token, secret, signature,
 * headers or body, and never returns an error message.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  TASK_AUTOMATION_LIMITS,
  TASK_AUTOMATION_WEBHOOK_KEY_PATTERN,
  referencedTemplateKeys,
} from '@intelliflow/domain';
import { pickTrustedForwardedIp } from '../../../security/client-ip';
import type { TaskAutomationStore, WebhookRule } from './task-automation-store';

const L = TASK_AUTOMATION_LIMITS;
export const TASK_AUTOMATION_WEBHOOK_PATHS = [
  '/api/webhooks/task-automation/',
  '/webhooks/task-automation/',
] as const;
const TOKEN_PATTERN = /^tat_[\w-]{43}$/;
const SIGNATURE_PATTERN = /^t=(\d{10}),v1=([0-9a-f]{64})$/;
const IDEMPOTENCY_KEY_PATTERN = /^[\w.:-]{1,128}$/;
const IP_FAILURES_PER_MINUTE = 120;
const BODY_READ_TIMEOUT_MS = 10_000;
const MAX_TRACKED_IPS = 10_000;

export interface WebhookResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

const NOT_FOUND: WebhookResponse = { status: 404, body: { error: 'not_found' } };
const INVALID_SIGNATURE: WebhookResponse = { status: 401, body: { error: 'invalid_signature' } };
const RATE_LIMITED: WebhookResponse = { status: 429, body: { error: 'rate_limited' } };

/**
 * Failure limiter that counts FAILED attempts only, keyed by IP for unknown tokens
 * and by IP plus rule once the token names a rule.
 */
export class WebhookFailureLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit = IP_FAILURES_PER_MINUTE,
    private readonly windowMs = 60_000
  ) {}

  isBlocked(ip: string, now: number): boolean {
    const window = this.windows.get(ip);
    if (!window || now - window.start >= this.windowMs) return false;
    return window.count >= this.limit;
  }

  recordFailure(ip: string, now: number): void {
    const window = this.windows.get(ip);
    if (!window || now - window.start >= this.windowMs) {
      this.windows.delete(ip);
      this.windows.set(ip, { start: now, count: 1 });
      if (this.windows.size > MAX_TRACKED_IPS) this.evict(now);
      return;
    }
    window.count++;
  }

  /** Drop expired windows, then the oldest; never reset live counters wholesale. */
  private evict(now: number): void {
    for (const [ip, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(ip);
    }
    while (this.windows.size > MAX_TRACKED_IPS) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }
}

/**
 * Rightmost forwarded hop (one trusted proxy in front), then x-real-ip, then the
 * socket address (direct clients must not share one failure bucket), then 'unknown'.
 */
export function webhookClientIp(
  headers: IncomingMessage['headers'],
  remoteAddress?: string
): string {
  const xff = headers['x-forwarded-for'];
  const fromXff = pickTrustedForwardedIp(Array.isArray(xff) ? xff.join(',') : xff);
  if (fromXff) return fromXff;
  const realIp = headers['x-real-ip'];
  const value = Array.isArray(realIp) ? realIp[0] : realIp;
  return value?.trim() || remoteAddress || 'unknown';
}

/** Signing secrets are encrypted at rest only when the field-encryption key is set (tests excepted). */
export function webhookEncryptionReady(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'test' || env.VITEST) return true;
  return Boolean(env.PRISMA_FIELD_ENCRYPTION_KEY?.trim());
}

/** The token hash the router stores and the route looks up (one definition for both). */
export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** HMAC-SHA256 hex over `${t}.${idempotencyKey}.${rawBody}` (raw bytes). */
export function signWebhookPayload(
  secret: string,
  timestamp: string,
  idempotencyKey: string,
  rawBody: Buffer
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${idempotencyKey}.`)
    .update(rawBody)
    .digest('hex');
}

function signatureMatches(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function header(headers: IncomingMessage['headers'], name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? undefined : value;
}

function verifySignature(
  rule: WebhookRule,
  headers: IncomingMessage['headers'],
  rawBody: Buffer,
  now: Date
): { ok: true; idempotencyKey: string } | { ok: false } {
  const signature = SIGNATURE_PATTERN.exec(header(headers, 'x-intelliflow-signature') ?? '');
  const idempotencyKey = header(headers, 'idempotency-key') ?? '';
  if (!signature || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) return { ok: false };
  const [, timestamp, received] = signature;
  if (Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp)) > L.webhookSkewSeconds) {
    return { ok: false };
  }
  const secrets = [rule.webhookSecret];
  if (
    rule.webhookSecretPreviousExpiresAt &&
    rule.webhookSecretPreviousExpiresAt.getTime() > now.getTime()
  ) {
    secrets.push(rule.webhookSecretPrevious);
  }
  for (const secret of secrets) {
    if (
      secret &&
      signatureMatches(signWebhookPayload(secret, timestamp, idempotencyKey, rawBody), received)
    ) {
      return { ok: true, idempotencyKey };
    }
  }
  return { ok: false };
}

function templatesOf(actions: unknown): string[] {
  if (!Array.isArray(actions)) return [];
  const templates: string[] = [];
  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;
    // Only rendered templates; the Notify message is plain text, so it pulls no payload keys.
    for (const field of ['titleTemplate', 'descriptionTemplate']) {
      const value = (action as Record<string, unknown>)[field];
      if (typeof value === 'string') templates.push(value);
    }
  }
  return templates;
}

function scalarValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string') return value.slice(0, L.webhookVarValueMax);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  return undefined;
}

/** Own top-level scalar keys the rule's templates reference (strings capped, ≤ 20 keys). */
export function webhookVariables(
  payload: Record<string, unknown>,
  actions: unknown
): Record<string, string | number | boolean> {
  const wanted = referencedTemplateKeys(templatesOf(actions), 'webhook')
    .filter((key) => TASK_AUTOMATION_WEBHOOK_KEY_PATTERN.test(key))
    .slice(0, L.webhookVarsMax);
  const vars: Record<string, string | number | boolean> = {};
  for (const key of wanted) {
    const value = Object.hasOwn(payload, key) ? scalarValue(payload[key]) : undefined;
    if (value !== undefined) vars[key] = value;
  }
  return vars;
}

export interface WebhookDeps {
  store: TaskAutomationStore;
  limiter: WebhookFailureLimiter;
  now: () => Date;
  /** False when signing secrets would not be encrypted at rest (no field-encryption key outside tests). */
  encryptionReady: () => boolean;
}

/**
 * Failures on a token that names a rule (paused, automation off, bad signature)
 * count against that token from this IP, not the bare IP, so one tenant's
 * misconfigured sender on a shared egress IP never blocks another tenant.
 */
function tokenFailureKey(ip: string, tokenHash: string): string {
  return `${ip}|${tokenHash}`;
}

/** Steps 4-9 (after the bounded body read). */
export async function handleTaskAutomationWebhook(
  token: string,
  headers: IncomingMessage['headers'],
  rawBody: Buffer,
  ip: string,
  deps: WebhookDeps
): Promise<WebhookResponse> {
  const now = deps.now();
  const fail = (response: WebhookResponse, key = ip): WebhookResponse => {
    deps.limiter.recordFailure(key, now.getTime());
    return response;
  };

  if (!TOKEN_PATTERN.test(token)) return fail(NOT_FOUND);
  const tokenHash = sha256Hex(token);
  const ruleKey = tokenFailureKey(ip, tokenHash);
  // Checked before the lookup, so a throttled sender costs no query.
  if (deps.limiter.isBlocked(ruleKey, now.getTime())) return RATE_LIMITED;
  const rule = await deps.store.loadWebhookRule(tokenHash);
  // An unknown token counts against the bare IP: random tokens never get a bucket of their own.
  if (!rule) return fail(NOT_FOUND);
  if (!rule.isActive || rule.triggerType !== 'WEBHOOK') return fail(NOT_FOUND, ruleKey);
  const settings = await deps.store.settings(rule.tenantId);
  if (!settings.automationEnabled) return fail(NOT_FOUND, ruleKey);
  if (!deps.encryptionReady()) return { status: 503, body: { error: 'unavailable' } };

  const verified = verifySignature(rule, headers, rawBody, now);
  if (!verified.ok) return fail(INVALID_SIGNATURE, ruleKey);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 400, body: { error: 'invalid_payload' } };
  }

  const payloadHash = sha256Hex(rawBody);
  // Caps are counted and the run inserted under one lock (no overshoot under concurrency).
  const result = await deps.store.admitRun(
    {
      tenantId: rule.tenantId,
      ruleId: rule.id,
      triggerType: 'WEBHOOK',
      idempotencyKey: `webhook:${verified.idempotencyKey}`,
      payloadHash,
      context: { webhook: webhookVariables(payload as Record<string, unknown>, rule.actions) },
      // Admission stores the actions re-read under its lock; take the variables
      // those actions reference, not the ones read with the token.
      contextFor: (actions) => ({
        webhook: webhookVariables(payload as Record<string, unknown>, actions),
      }),
      actions: rule.actions,
      // A URL regeneration or a revoking secret rotation committed since the
      // lookup wins: the request is verified again against the locked row.
      stillVerifies: (credentials) =>
        credentials.webhookTokenHash === tokenHash &&
        verifySignature({ ...rule, ...credentials }, headers, rawBody, now).ok,
    },
    { perMinute: L.webhookPerMinuteCap, perHour: settings.maxRunsPerRulePerHour },
    now
  );
  // Deactivated, deleted or re-credentialed after the lookup: answered like an unknown token.
  if ('inactive' in result) return NOT_FOUND;
  if ('capped' in result) {
    await deps.store.recordSuppressed(rule.tenantId, rule.id, now);
    return RATE_LIMITED;
  }
  if (result.created) return { status: 202, body: { accepted: true, duplicate: false } };
  if (result.existingPayloadHash === payloadHash) {
    return { status: 202, body: { accepted: true, duplicate: true } };
  }
  return { status: 409, body: { error: 'idempotency_conflict' } };
}

export function matchTaskAutomationWebhookPath(pathname: string): string | null {
  for (const prefix of TASK_AUTOMATION_WEBHOOK_PATHS) {
    if (pathname.startsWith(prefix)) return pathname.slice(prefix.length);
  }
  return null;
}

class BodyTooLargeError extends Error {}

/** Read at most `maxBytes`, within `timeoutMs`; never buffers more than the cap. */
export function readBoundedBody(
  req: IncomingMessage,
  maxBytes: number,
  timeoutMs = BODY_READ_TIMEOUT_MS
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => finish(new Error('body_timeout')), timeoutMs);
    timer.unref?.();
    function finish(error?: Error) {
      clearTimeout(timer);
      req.removeAllListeners('data');
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    }
    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        req.pause();
        finish(new BodyTooLargeError('too_large'));
        return;
      }
      chunks.push(buffer);
    });
    req.once('end', () => finish());
    req.once('error', (err) => finish(err));
  });
}

function send(res: ServerResponse, response: WebhookResponse): void {
  res.statusCode = response.status;
  res.setHeader('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(response.headers ?? {})) res.setHeader(name, value);
  res.end(JSON.stringify(response.body));
}

const DISCARD_GRACE_MS = 2_000;

/**
 * Write the response with `Connection: close`. The rest of the upload is
 * discarded (never buffered) so the client can read the response, and the
 * request is destroyed after a short grace period whatever it still sends.
 */
function sendAndClose(req: IncomingMessage, res: ServerResponse, response: WebhookResponse): void {
  send(res, { ...response, headers: { ...response.headers, Connection: 'close' } });
  req.on('data', () => undefined);
  req.resume();
  setTimeout(() => req.destroy(), DISCARD_GRACE_MS).unref();
}

const TOO_LARGE: WebhookResponse = { status: 413, body: { error: 'payload_too_large' } };
const INVALID_REQUEST: WebhookResponse = { status: 400, body: { error: 'invalid_request' } };

export interface WebhookRouteDeps extends WebhookDeps {
  log?: Pick<Console, 'warn'>;
}

/** Steps 1-3 plus the handler; catches everything (generic 500, nothing leaked). */
export async function handleTaskAutomationWebhookRoute(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  deps: WebhookRouteDeps
): Promise<void> {
  try {
    if ((req.method?.toUpperCase() ?? 'GET') !== 'POST') {
      send(res, { status: 405, body: { error: 'method_not_allowed' }, headers: { Allow: 'POST' } });
      return;
    }
    const ip = webhookClientIp(req.headers, req.socket?.remoteAddress);
    const now = deps.now().getTime();
    if (
      deps.limiter.isBlocked(ip, now) ||
      (TOKEN_PATTERN.test(token) &&
        deps.limiter.isBlocked(tokenFailureKey(ip, sha256Hex(token)), now))
    ) {
      send(res, RATE_LIMITED);
      return;
    }
    // Unauthenticated read failures count against the IP like bad tokens do.
    const rejectRead = (response: WebhookResponse) => {
      deps.limiter.recordFailure(ip, deps.now().getTime());
      sendAndClose(req, res, response);
    };
    const declared = Number(req.headers['content-length'] ?? '0');
    if (Number.isFinite(declared) && declared > L.webhookBodyMaxBytes) {
      rejectRead(TOO_LARGE);
      return;
    }
    let body: Buffer;
    try {
      body = await readBoundedBody(req, L.webhookBodyMaxBytes);
    } catch (err) {
      rejectRead(err instanceof BodyTooLargeError ? TOO_LARGE : INVALID_REQUEST);
      return;
    }
    send(res, await handleTaskAutomationWebhook(token, req.headers, body, ip, deps));
  } catch (err) {
    (deps.log ?? console).warn(
      `[task-automation] webhook failed: ${err instanceof Error ? err.name : 'unknown'}`
    );
    if (!res.headersSent) send(res, { status: 500, body: { error: 'internal' } });
  }
}
