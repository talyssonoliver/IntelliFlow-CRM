/**
 * Task automation webhook handler (PG-208, ADR-084). Tokens, secrets and
 * signatures are built at runtime; the clock is pinned for the ±300 s window.
 */
import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { decryptField, encryptField } from '@intelliflow/db';
import {
  WebhookFailureLimiter,
  handleTaskAutomationWebhook,
  matchTaskAutomationWebhookPath,
  sha256Hex,
  signWebhookPayload,
  webhookClientIp,
  webhookVariables,
  type WebhookDeps,
} from '../task-automation-webhook';
import { FakeTaskAutomationStore } from './fake-task-automation-store';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const T1 = 'tenant-a';
const IP = '203.0.113.7';

let store: FakeTaskAutomationStore;
let limiter: WebhookFailureLimiter;
let deps: WebhookDeps;
let token: string;
let secret: string;
let ruleId: string;

function body(value: unknown = { orderId: 'A-17', amount: 42, urgent: true }): Buffer {
  return Buffer.from(JSON.stringify(value));
}

function signed(raw: Buffer, key = 'order-17', options: { secret?: string; t?: number } = {}) {
  const t = String(options.t ?? Math.floor(NOW.getTime() / 1000));
  return {
    'x-intelliflow-signature': `t=${t},v1=${signWebhookPayload(options.secret ?? secret, t, key, raw)}`,
    'idempotency-key': key,
  };
}

function call(raw: Buffer, headers: Record<string, string>, useToken = token) {
  return handleTaskAutomationWebhook(useToken, headers, raw, IP, deps);
}

beforeEach(() => {
  store = new FakeTaskAutomationStore(() => NOW);
  limiter = new WebhookFailureLimiter(3);
  token = 'tat_' + randomBytes(32).toString('base64url');
  secret = randomBytes(32).toString('hex');
  const rule = store.rule({
    tenantId: T1,
    triggerType: 'WEBHOOK',
    eventType: null,
    webhookTokenHash: sha256Hex(token),
    webhookSecret: secret,
    actions: [
      {
        type: 'CREATE_TASK',
        titleTemplate: 'Order {{webhook.orderId}} {{webhook.urgent}}',
        descriptionTemplate: '{{webhook.constructor}}',
        priority: 'MEDIUM',
        dueInDays: null,
        linkToRecord: false,
      },
    ],
  });
  ruleId = rule.id;
  deps = { store, limiter, now: () => NOW, encryptionReady: () => true };
});

describe('handleTaskAutomationWebhook', () => {
  it('accepts a signed request and queues one run with only the referenced variables', async () => {
    const raw = body();
    await expect(call(raw, signed(raw))).resolves.toEqual({
      status: 202,
      body: { accepted: true, duplicate: false },
    });
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({
      tenantId: T1,
      ruleId,
      triggerType: 'WEBHOOK',
      idempotencyKey: 'webhook:order-17',
      payloadHash: sha256Hex(raw),
      context: { webhook: { orderId: 'A-17', urgent: true } },
    });
  });

  /** `change` runs on the stored rule right after the handler looked the token up. */
  function changeRuleAfterLookup(change: (stored: (typeof store.rules)[number]) => void) {
    const lookup = store.loadWebhookRule.bind(store);
    vi.spyOn(store, 'loadWebhookRule').mockImplementationOnce(async (hash) => {
      const found = await lookup(hash);
      change(store.rules.find((r) => r.id === ruleId)!);
      return found;
    });
  }

  it('admits a run with the actions the rule holds at admission, not the looked-up copy', async () => {
    const edited = [
      {
        type: 'CREATE_TASK',
        titleTemplate: 'Edited after the lookup',
        priority: 'HIGH',
        dueInDays: 2,
        linkToRecord: false,
      },
    ];
    changeRuleAfterLookup((stored) => {
      stored.actions = edited;
    });
    const raw = body();
    await expect(call(raw, signed(raw))).resolves.toMatchObject({ status: 202 });
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0].actions).toEqual(edited);
  });

  it('takes the webhook variables the admitted actions reference, not the looked-up ones', async () => {
    const edited = [
      {
        type: 'CREATE_TASK',
        titleTemplate: 'Order {{webhook.orderId}} for {{webhook.amount}}',
        priority: 'HIGH',
        dueInDays: null,
        linkToRecord: false,
      },
    ];
    changeRuleAfterLookup((stored) => {
      stored.actions = edited;
    });
    const raw = body();
    await expect(call(raw, signed(raw))).resolves.toMatchObject({ status: 202 });
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0].actions).toEqual(edited);
    // `amount` is only in the edited template; `urgent` only in the looked-up one.
    expect(store.runs[0].context).toEqual({ webhook: { orderId: 'A-17', amount: 42 } });
  });

  it('answers 404 and queues nothing for a rule deactivated after the lookup', async () => {
    changeRuleAfterLookup((stored) => {
      stored.isActive = false;
    });
    const raw = body();
    await expect(call(raw, signed(raw))).resolves.toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(store.runs).toHaveLength(0);
  });

  it('treats a replay with the same key and body as a duplicate, a different body as a conflict', async () => {
    const raw = body();
    await call(raw, signed(raw));
    await expect(call(raw, signed(raw))).resolves.toMatchObject({
      status: 202,
      body: { duplicate: true },
    });
    const other = body({ orderId: 'B-2' });
    await expect(call(other, signed(other))).resolves.toEqual({
      status: 409,
      body: { error: 'idempotency_conflict' },
    });
    expect(store.runs).toHaveLength(1);
  });

  it('rejects a replayed signature under a new Idempotency-Key (the key is signed)', async () => {
    const raw = body();
    const headers = signed(raw, 'first-key');
    const response = await call(raw, { ...headers, 'idempotency-key': 'second-key' });
    expect(response).toEqual({ status: 401, body: { error: 'invalid_signature' } });
    expect(store.runs).toHaveLength(0);
  });

  it.each([
    ['no signature', (raw: Buffer) => ({ 'idempotency-key': 'k' }) as Record<string, string>],
    [
      'no idempotency key',
      (raw: Buffer) => ({ 'x-intelliflow-signature': signed(raw)['x-intelliflow-signature'] }),
    ],
    ['a malformed key', (raw: Buffer) => ({ ...signed(raw, 'bad key!') })],
    [
      'a non-numeric timestamp',
      (raw: Buffer) => ({
        ...signed(raw),
        'x-intelliflow-signature': 't=abcdefghij,v1=' + 'a'.repeat(64),
      }),
    ],
    [
      'two v1 values',
      (raw: Buffer) => ({
        ...signed(raw),
        'x-intelliflow-signature': signed(raw)['x-intelliflow-signature'] + ',v1=' + 'a'.repeat(64),
      }),
    ],
    [
      'uppercase hex',
      (raw: Buffer) => ({
        ...signed(raw),
        'x-intelliflow-signature': signed(raw)
          ['x-intelliflow-signature'].toUpperCase()
          .replace('T=', 't=')
          .replace('V1=', 'v1='),
      }),
    ],
    [
      'a short signature',
      (raw: Buffer) => ({
        ...signed(raw),
        'x-intelliflow-signature': `t=${Math.floor(NOW.getTime() / 1000)},v1=${'a'.repeat(40)}`,
      }),
    ],
    [
      'a wrong secret',
      (raw: Buffer) => signed(raw, 'k', { secret: randomBytes(32).toString('hex') }),
    ],
    [
      'a stale timestamp (301 s)',
      (raw: Buffer) => signed(raw, 'k', { t: Math.floor(NOW.getTime() / 1000) - 301 }),
    ],
    [
      'a future timestamp (301 s)',
      (raw: Buffer) => signed(raw, 'k', { t: Math.floor(NOW.getTime() / 1000) + 301 }),
    ],
  ])('answers 401 to %s and writes nothing', async (_label, build) => {
    const raw = body();
    await expect(call(raw, build(raw))).resolves.toEqual({
      status: 401,
      body: { error: 'invalid_signature' },
    });
    expect(store.runs).toHaveLength(0);
  });

  it('accepts the edge of the window (300 s)', async () => {
    const raw = body();
    const response = await call(
      raw,
      signed(raw, 'k', { t: Math.floor(NOW.getTime() / 1000) - 300 })
    );
    expect(response.status).toBe(202);
  });

  it('gives every unknown, malformed, inactive or disabled token the same 404', async () => {
    const raw = body();
    const responses = [
      await call(raw, signed(raw), 'tat_' + 'x'.repeat(43)),
      await call(raw, signed(raw), 'not-a-token'),
    ];
    store.rules[0].isActive = false;
    responses.push(await call(raw, signed(raw)));
    store.rules[0].isActive = true;
    store.settingsByTenant.set(T1, {
      automationEnabled: false,
      maxRunsPerRulePerHour: 60,
      notifyRuleOwnerOnFailure: false,
    });
    responses.push(await call(raw, signed(raw)));
    store.settingsByTenant.delete(T1);
    store.rules[0].triggerType = 'SCHEDULE';
    responses.push(await call(raw, signed(raw)));
    for (const response of responses)
      expect(response).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(store.runs).toHaveLength(0);
  });

  it('accepts the previous secret inside its grace window only, and never after revocation', async () => {
    const previous = secret;
    store.rules[0].webhookSecret = randomBytes(32).toString('hex');
    store.rules[0].webhookSecretPrevious = previous;
    store.rules[0].webhookSecretPreviousExpiresAt = new Date(NOW.getTime() + 1000);
    const raw = body();
    expect((await call(raw, signed(raw, 'k1', { secret: previous }))).status).toBe(202);
    store.rules[0].webhookSecretPreviousExpiresAt = new Date(NOW.getTime() - 1000);
    expect((await call(raw, signed(raw, 'k2', { secret: previous }))).status).toBe(401);
    store.rules[0].webhookSecretPrevious = null;
    store.rules[0].webhookSecretPreviousExpiresAt = null;
    expect((await call(raw, signed(raw, 'k3', { secret: previous }))).status).toBe(401);
  });

  it('refuses (503) when secrets are not encrypted at rest', async () => {
    deps.encryptionReady = () => false;
    const raw = body();
    await expect(call(raw, signed(raw))).resolves.toEqual({
      status: 503,
      body: { error: 'unavailable' },
    });
  });

  it('rejects a non-object JSON body after verification', async () => {
    for (const raw of [Buffer.from('[1,2]'), Buffer.from('nope'), Buffer.from('null')]) {
      await expect(call(raw, signed(raw, `k-${raw.length}`))).resolves.toEqual({
        status: 400,
        body: { error: 'invalid_payload' },
      });
    }
    expect(store.runs).toHaveLength(0);
  });

  it('applies the per-rule minute and hourly caps (429) and counts the suppression', async () => {
    store.settingsByTenant.set(T1, {
      automationEnabled: true,
      maxRunsPerRulePerHour: 1,
      notifyRuleOwnerOnFailure: false,
    });
    const raw = body();
    expect((await call(raw, signed(raw, 'a'))).status).toBe(202);
    expect(await call(raw, signed(raw, 'b'))).toEqual({
      status: 429,
      body: { error: 'rate_limited' },
    });
    expect(store.rules[0].suppressedCount).toBe(1);
  });

  it('counts failures per IP but never valid signed requests', async () => {
    const raw = body();
    for (let i = 0; i < 3; i++) await call(raw, signed(raw), 'tat_' + 'x'.repeat(43));
    expect(limiter.isBlocked(IP, NOW.getTime())).toBe(true);
    const fresh = new WebhookFailureLimiter(3);
    deps.limiter = fresh;
    for (let i = 0; i < 5; i++) await call(raw, signed(raw, `ok-${i}`));
    expect(fresh.isBlocked(IP, NOW.getTime())).toBe(false);
  });

  it('works with a secret round-tripped through field encryption', () => {
    const key = randomBytes(32);
    const stored = encryptField(secret, key);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(decryptField(stored, key)).toBe(secret);
  });

  it('never logs the token, the secret or the signature', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined)
    );
    const raw = body();
    const headers = signed(raw);
    await call(raw, headers);
    await call(raw, { ...headers, 'idempotency-key': 'other' });
    vi.spyOn(store, 'loadWebhookRule').mockRejectedValueOnce(new Error('db down'));
    await expect(call(raw, headers)).rejects.toThrow('db down');
    const logged = spies.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain(headers['x-intelliflow-signature'].split('v1=')[1]);
    spies.forEach((spy) => spy.mockRestore());
  });
});

describe('helpers', () => {
  it('keeps only own scalar keys the templates reference, capped', () => {
    const payload = Object.assign(Object.create({ inherited: 'x' }), {
      orderId: 'o'.repeat(600),
      nested: { a: 1 },
      list: [1],
      count: Number.NaN,
      flag: false,
    });
    const actions = [
      {
        titleTemplate:
          '{{webhook.orderId}} {{webhook.inherited}} {{webhook.nested}} {{webhook.list}} {{webhook.count}} {{webhook.flag}} {{webhook.missing}}',
      },
    ];
    expect(webhookVariables(payload, actions)).toEqual({ orderId: 'o'.repeat(500), flag: false });
    expect(webhookVariables({ a: 1 }, 'not-actions')).toEqual({});
  });

  it('matches both mount paths and nothing else', () => {
    expect(matchTaskAutomationWebhookPath('/api/webhooks/task-automation/tat_abc')).toBe('tat_abc');
    expect(matchTaskAutomationWebhookPath('/webhooks/task-automation/tat_abc')).toBe('tat_abc');
    expect(matchTaskAutomationWebhookPath('/api/webhooks/stripe')).toBeNull();
  });

  it('takes the rightmost forwarded hop, then x-real-ip, then unknown', () => {
    expect(webhookClientIp({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })).toBe('2.2.2.2');
    expect(webhookClientIp({ 'x-forwarded-for': ['1.1.1.1', '3.3.3.3'] })).toBe('3.3.3.3');
    expect(webhookClientIp({ 'x-real-ip': '4.4.4.4' })).toBe('4.4.4.4');
    expect(webhookClientIp({ 'x-real-ip': ['5.5.5.5'] })).toBe('5.5.5.5');
    expect(webhookClientIp({})).toBe('unknown');
    expect(webhookClientIp({}, '203.0.113.7')).toBe('203.0.113.7');
    expect(webhookClientIp({ 'x-real-ip': '4.4.4.4' }, '203.0.113.7')).toBe('4.4.4.4');
  });

  it('evicts expired windows, then the oldest, instead of resetting every counter', () => {
    const limiter = new WebhookFailureLimiter(1, 60_000);
    limiter.recordFailure('blocked', 0);
    for (let i = 0; i < 10_000; i++) limiter.recordFailure(`ip-${i}`, 1);
    // 10,001 tracked: the oldest ('blocked') is evicted; recent IPs keep their counts.
    expect(limiter.isBlocked('blocked', 2)).toBe(false);
    expect(limiter.isBlocked('ip-9999', 2)).toBe(true);
    limiter.recordFailure('late', 70_000);
    expect(limiter.isBlocked('ip-9999', 70_001)).toBe(false);
    expect(limiter.isBlocked('late', 70_001)).toBe(true);
  });

  it('resets the failure window after a minute', () => {
    const limiter = new WebhookFailureLimiter(1, 60_000);
    limiter.recordFailure('ip', 0);
    limiter.recordFailure('ip', 10);
    expect(limiter.isBlocked('ip', 20)).toBe(true);
    expect(limiter.isBlocked('ip', 60_001)).toBe(false);
    limiter.recordFailure('ip', 60_001);
    expect(limiter.isBlocked('ip', 60_002)).toBe(true);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
