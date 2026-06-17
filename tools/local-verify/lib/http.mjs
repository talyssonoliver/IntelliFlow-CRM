// Shared low-level HTTP helpers for the local-verify harness.
//
// We use the raw `node:http` client (not `fetch`) because undici silently drops
// the forbidden `Origin` request header — and CORS behaviour is the entire point
// of several of these checks. Everything here is dependency-free ESM so the
// harness runs with a bare `node tools/local-verify/<script>.mjs`.

import http from 'node:http';
import https from 'node:https';

/**
 * Low-level request with full control over headers (including `Origin`).
 * Returns { status, headers, body }.
 */
export function request(urlString, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Encode a tRPC query GET URL (batched, superjson-free `{ json: <input> }`). */
export function trpcQueryUrl(apiUrl, procedure, input = null) {
  const payload = encodeURIComponent(JSON.stringify({ 0: { json: input } }));
  return `${apiUrl}/api/trpc/${procedure}?batch=1&input=${payload}`;
}

/** Parse a batched tRPC GET response into the first result's `data`. */
export function parseTrpcBatch(bodyText) {
  const parsed = JSON.parse(bodyText);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const data = first?.result?.data;
  // No superjson transformer on this API, so data is plain (no `.json` unwrap).
  return data?.json ?? data;
}

// ---- tiny test-reporter -----------------------------------------------------

export function makeReporter(suiteName) {
  const results = [];
  return {
    check(name, passed, detail = '') {
      results.push({ name, passed: Boolean(passed), detail });
      const tag = passed ? '✓ PASS' : '✗ FAIL';
      console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
      return Boolean(passed);
    },
    note(name, detail) {
      results.push({ name, passed: null, detail });
      console.log(`  ○ NOTE  ${name}${detail ? ` — ${detail}` : ''}`);
    },
    finish() {
      const failed = results.filter((r) => r.passed === false);
      const passed = results.filter((r) => r.passed === true);
      const notes = results.filter((r) => r.passed === null);
      console.log(
        `\n[${suiteName}] ${passed.length} passed, ${failed.length} failed, ${notes.length} notes`
      );
      return { suiteName, results, ok: failed.length === 0 };
    },
  };
}
