/**
 * Hosted-database boot guard (ENG-OPS-002, register row 65, incident 2026-11-27).
 * URLs are built at runtime from parts with placeholder values so no connection string is committed.
 */
import { describe, it, expect, vi } from 'vitest';
import { assertHostedDbAllowed, isDeployedRuntime, isHostedSupabaseUrl } from '../hosted-db-guard';

const SCHEME = ['post', 'gres://'].join('');
const CRED = `role:${'x'.repeat(12)}@`;
const HOSTED_DIRECT_HOST = `db.${'a'.repeat(20)}.supabase${'.co'}`;
const HOSTED_POOLER_HOST = `region-0.pooler.supabase${'.com'}`;

const localUrl = `${SCHEME}${CRED}localhost:5433/intelliflow_test`;
const hostedDirect = `${SCHEME}${CRED}${HOSTED_DIRECT_HOST}:5432/postgres`;
const hostedPooler = `${SCHEME}role.${'a'.repeat(20)}:${'x'.repeat(12)}@${HOSTED_POOLER_HOST}:6543/postgres?pgbouncer=true`;
const opts = (env: Record<string, string | undefined>, warn = vi.fn()) => ({
  variableName: 'DATABASE_URL',
  env,
  warn,
});

describe('hosted-db-guard', () => {
  it('passes a local (localhost) database', () => {
    expect(() => assertHostedDbAllowed(localUrl, opts({}))).not.toThrow();
    const loopback = `${SCHEME}${CRED}127.0.0.1:5433/intelliflow_test`;
    expect(() => assertHostedDbAllowed(loopback, opts({}))).not.toThrow();
  });

  it('passes when no connection string is set (the caller owns that error)', () => {
    expect(() => assertHostedDbAllowed(undefined, opts({}))).not.toThrow();
    expect(() => assertHostedDbAllowed('', opts({}))).not.toThrow();
  });

  it.each([
    ['direct host', hostedDirect],
    ['pooler host', hostedPooler],
  ])('throws for a hosted %s with no deployed runtime', (_label, url) => {
    expect(() => assertHostedDbAllowed(url, opts({}))).toThrow(
      /DATABASE_URL names a hosted database outside a deployed runtime/
    );
  });

  it('still throws when VERCEL_ENV is development or empty', () => {
    expect(() =>
      assertHostedDbAllowed(hostedDirect, opts({ VERCEL_ENV: 'development' }))
    ).toThrow();
    expect(() => assertHostedDbAllowed(hostedDirect, opts({ VERCEL_ENV: '' }))).toThrow();
  });

  it('passes hosted + RAILWAY_ENVIRONMENT', () => {
    expect(() =>
      assertHostedDbAllowed(hostedPooler, opts({ RAILWAY_ENVIRONMENT: 'production' }))
    ).not.toThrow();
  });

  it.each(['production', 'preview'])('passes hosted + VERCEL_ENV=%s', (vercelEnv) => {
    expect(() =>
      assertHostedDbAllowed(hostedDirect, opts({ VERCEL_ENV: vercelEnv }))
    ).not.toThrow();
  });

  it('passes hosted + ALLOW_HOSTED_DB=1 with a loud warning that names no URL', () => {
    const warn = vi.fn();
    expect(() =>
      assertHostedDbAllowed(hostedDirect, opts({ ALLOW_HOSTED_DB: '1' }, warn))
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('ALLOW_HOSTED_DB=1');
    expect(message).not.toContain(HOSTED_DIRECT_HOST);
    expect(message).not.toContain('x'.repeat(12));
  });

  it('does not treat ALLOW_HOSTED_DB values other than 1 as an escape', () => {
    expect(() => assertHostedDbAllowed(hostedDirect, opts({ ALLOW_HOSTED_DB: 'true' }))).toThrow();
  });

  it('never puts the URL, host or credentials in the error message', () => {
    for (const url of [hostedDirect, hostedPooler]) {
      let message = '';
      try {
        assertHostedDbAllowed(url, opts({}));
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(url);
      expect(message).not.toContain(HOSTED_DIRECT_HOST);
      expect(message).not.toContain(HOSTED_POOLER_HOST);
      expect(message).not.toContain('x'.repeat(12));
      expect(message).not.toContain('a'.repeat(20));
      expect(message).not.toContain('://');
    }
  });

  it('names the variable it was given', () => {
    expect(() =>
      assertHostedDbAllowed(hostedDirect, { variableName: 'EVENTS_DB_URL', env: {} })
    ).toThrow(/EVENTS_DB_URL names a hosted database outside a deployed runtime/);
  });

  describe('host matching', () => {
    it('matches by host suffix, case-insensitively, with special characters in the password', () => {
      const odd = `${SCHEME}role:p@ss/w?rd#${'x'.repeat(6)}@${HOSTED_DIRECT_HOST.toUpperCase()}:5432/postgres`;
      expect(isHostedSupabaseUrl(odd)).toBe(true);
    });

    it('does not match lookalike hosts or a supabase name in the path or password', () => {
      const lookalike = `${SCHEME}${CRED}db.example.invalid:5432/postgres`;
      const inPath = `${SCHEME}${CRED}localhost:5433/${HOSTED_DIRECT_HOST}`;
      const inPassword = `${SCHEME}role:${HOSTED_DIRECT_HOST}@localhost:5433/postgres`;
      const suffixOnly = `${SCHEME}${CRED}notsupabase${'.co'}:5432/postgres`;
      for (const url of [lookalike, inPath, inPassword, suffixOnly]) {
        expect(isHostedSupabaseUrl(url)).toBe(false);
      }
    });
  });

  describe('isDeployedRuntime', () => {
    it('is false for an empty or local environment', () => {
      expect(isDeployedRuntime({})).toBe(false);
      expect(isDeployedRuntime({ VERCEL: '1' })).toBe(false);
    });
    it('is true for Railway and for Vercel production or preview', () => {
      expect(isDeployedRuntime({ RAILWAY_ENVIRONMENT: 'production' })).toBe(true);
      expect(isDeployedRuntime({ VERCEL_ENV: 'production' })).toBe(true);
      expect(isDeployedRuntime({ VERCEL_ENV: 'preview' })).toBe(true);
    });
  });
});
