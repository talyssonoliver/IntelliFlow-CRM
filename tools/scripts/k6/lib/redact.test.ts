import { describe, it, expect } from 'vitest';

import { redactString, redactSecrets, sanitizeSummaryData, REDACTED } from './redact.js';

// Build JWTs at runtime so no `eyJ...` literal is committed to source (keeps
// gitleaks green on this diff). base64url of `{"alg"...}` always begins `eyJ`.
function makeJwt(payload: Record<string, unknown>): string {
  const seg = (o: Record<string, unknown>) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${seg({ alg: 'HS256', typ: 'JWT' })}.${seg(payload)}.c2lnbmF0dXJl`;
}

const SAMPLE_JWT = makeJwt({ sub: '1234567890', role: 'authenticated' });

describe('redactString', () => {
  it('replaces a standalone JWT with the redaction marker', () => {
    expect(SAMPLE_JWT.startsWith('eyJ')).toBe(true);
    expect(redactString(SAMPLE_JWT)).toBe(REDACTED);
  });

  it('redacts a JWT embedded in a larger string', () => {
    expect(redactString(`Bearer ${SAMPLE_JWT}`)).toBe(`Bearer ${REDACTED}`);
  });

  it('leaves non-JWT strings untouched', () => {
    expect(redactString('hello world')).toBe('hello world');
  });

  it('passes non-string values through unchanged', () => {
    expect(redactString(42 as unknown as string)).toBe(42);
    expect(redactString(null as unknown as string)).toBeNull();
  });
});

describe('redactSecrets', () => {
  it('masks secret-keyed values regardless of their string shape', () => {
    const out = redactSecrets({ authToken: 'anything', apikey: 'x', password: 'p' });
    expect(out).toEqual({ authToken: REDACTED, apikey: REDACTED, password: REDACTED });
  });

  it('masks assorted secret key spellings', () => {
    const out = redactSecrets({
      access_token: 'a',
      refresh_token: 'b',
      Authorization: 'c',
      service_role_key: 'd',
      anon_key: 'e',
      token: 'f',
    }) as Record<string, string>;
    Object.values(out).forEach((v) => expect(v).toBe(REDACTED));
  });

  it('redacts JWT strings nested in arrays and objects', () => {
    const out = redactSecrets({ items: [{ note: SAMPLE_JWT }, 'plain'] });
    expect(out).toEqual({ items: [{ note: REDACTED }, 'plain'] });
  });

  it('preserves non-secret performance data', () => {
    const input = { p95: 11.6, name: 'load', nested: { ok: true, count: 3 } };
    expect(redactSecrets(input)).toEqual(input);
  });

  it('does not mutate the input object', () => {
    const input = { authToken: SAMPLE_JWT };
    redactSecrets(input);
    expect(input.authToken).toBe(SAMPLE_JWT);
  });
});

describe('sanitizeSummaryData', () => {
  it('drops setup_data entirely', () => {
    const data = {
      metrics: { p95: 1 },
      setup_data: { authToken: SAMPLE_JWT, startTime: 't' },
    };
    const out = sanitizeSummaryData(data) as Record<string, unknown>;
    expect(out).not.toHaveProperty('setup_data');
    expect(out).toEqual({ metrics: { p95: 1 } });
  });

  it('redacts a JWT that leaks outside setup_data', () => {
    const data = { root_group: { checks: { auth: { token: SAMPLE_JWT } } } };
    const out = sanitizeSummaryData(data) as {
      root_group: { checks: { auth: { token: string } } };
    };
    expect(JSON.stringify(out)).not.toContain('eyJ');
    expect(out.root_group.checks.auth.token).toBe(REDACTED);
  });

  it('handles non-object input via redactSecrets', () => {
    expect(sanitizeSummaryData(SAMPLE_JWT)).toBe(REDACTED);
    expect(sanitizeSummaryData(null)).toBeNull();
  });

  it('produces JWT-free, setup_data-free JSON for a realistic summary', () => {
    const data = {
      metrics: { http_req_duration: { values: { 'p(95)': 12 } } },
      setup_data: { authToken: SAMPLE_JWT },
      state: { testRunDurationMs: 30000 },
    };
    const json = JSON.stringify(sanitizeSummaryData(data));
    expect(json).not.toContain('eyJ');
    expect(json).not.toContain('setup_data');
    expect(json).toContain('p(95)');
  });
});
