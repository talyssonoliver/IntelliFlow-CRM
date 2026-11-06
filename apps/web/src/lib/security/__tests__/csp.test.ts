import { describe, it, expect } from 'vitest';
import { buildReportOnlyCsp, originOf, sentryReportUri } from '../csp';

// A DSN shape on a reserved host, assembled at runtime: not a real key or project.
const INGEST_HOST = ['o1', 'ingest', 'example', 'invalid'].join('.');
const FAKE_DSN = `https://${'publickey'}@${INGEST_HOST}/${'4242'}`;

function directive(csp: string, name: string): string {
  return csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';
}

describe('sentryReportUri', () => {
  it('builds the security endpoint from the DSN', () => {
    const uri = new URL(sentryReportUri(FAKE_DSN)!);

    expect(uri.origin).toBe(`https://${INGEST_HOST}`);
    expect(uri.pathname).toBe('/api/4242/security/');
    expect(uri.searchParams.get('sentry_key')).toBe('publickey');
  });

  it('adds the environment when set', () => {
    expect(
      new URL(sentryReportUri(FAKE_DSN, ' preview ')!).searchParams.get('sentry_environment')
    ).toBe('preview');
  });

  it.each([
    undefined,
    '',
    'not a url',
    `http://k@${INGEST_HOST}/1`,
    `https://${INGEST_HOST}/1`,
    `https://k@${INGEST_HOST}/abc`,
  ])('gives null for %s', (dsn) => {
    expect(sentryReportUri(dsn)).toBeNull();
  });
});

describe('originOf', () => {
  it('keeps scheme, host and port only', () => {
    expect(originOf('https://api.example.invalid:8443/trpc?x=1')).toBe(
      'https://api.example.invalid:8443'
    );
    expect(originOf('wss://ws.example.invalid/socket')).toBe('wss://ws.example.invalid');
  });

  it.each([undefined, '', 'javascript:alert(1)', 'not a url'])('gives null for %s', (value) => {
    expect(originOf(value)).toBeNull();
  });
});

describe('buildReportOnlyCsp', () => {
  it('reports to Sentry when a DSN is set', () => {
    const csp = buildReportOnlyCsp({ sentryDsn: FAKE_DSN });

    expect(directive(csp, 'report-uri')).toContain(`https://${INGEST_HOST}/api/4242/security/`);
    expect(directive(csp, 'connect-src')).toContain(`https://${INGEST_HOST}`);
  });

  it('has no report endpoint without a DSN, so violations only reach the console', () => {
    expect(buildReportOnlyCsp({})).not.toContain('report-uri');
  });

  it('allows the API, its socket, the WebSocket server and Supabase from the environment', () => {
    const csp = buildReportOnlyCsp({
      apiUrl: 'https://api.example.invalid/',
      wsUrl: 'wss://ws.example.invalid/socket',
      supabaseUrl: 'http://127.0.0.1:54321',
    });
    const connect = directive(csp, 'connect-src');

    for (const source of [
      'https://api.example.invalid',
      'wss://api.example.invalid',
      'wss://ws.example.invalid',
      'http://127.0.0.1:54321',
      'ws://127.0.0.1:54321',
    ]) {
      expect(connect.split(' ')).toContain(source);
    }
    expect(directive(csp, 'frame-src').split(' ')).toContain('http://127.0.0.1:54321');
  });

  it('names Stripe for scripts, frames and its API', () => {
    const csp = buildReportOnlyCsp({});

    expect(directive(csp, 'script-src')).toContain('https://js.stripe.com');
    expect(directive(csp, 'frame-src')).toContain('https://hooks.stripe.com');
    expect(directive(csp, 'connect-src')).toContain('https://api.stripe.com');
  });

  it('uses no nonce yet and allows inline scripts, so prerendered pages are not reported', () => {
    const script = directive(buildReportOnlyCsp({}), 'script-src');

    expect(script).not.toMatch(/nonce-|strict-dynamic/);
    expect(script).toContain("'unsafe-inline'");
  });

  it('keeps the other protections', () => {
    const csp = buildReportOnlyCsp({});

    for (const rule of [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ]) {
      expect(csp).toContain(rule);
    }
  });

  it('lists each source once', () => {
    const connect = directive(
      buildReportOnlyCsp({
        supabaseUrl: 'https://abc.supabase.co',
        apiUrl: 'https://abc.supabase.co',
      }),
      'connect-src'
    ).split(' ');

    expect(new Set(connect).size).toBe(connect.length);
  });
});
