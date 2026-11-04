import { describe, expect, it } from 'vitest';
import type { MailboxErrorCode } from '@intelliflow/domain';
import { connectionFailureHelp } from '../connection-help';
import { MAILBOX_PROVIDERS, providerById, providerByServer } from '../mailbox-providers';

const provider = (id: Parameters<typeof providerById>[0]) => {
  const found = providerById(id);
  if (!found) throw new Error(`no provider ${id}`);
  return found;
};

describe('MAILBOX_PROVIDERS', () => {
  it('links every provider to its own help pages over https', () => {
    for (const p of MAILBOX_PROVIDERS) {
      expect(p.docsUrl, p.id).toMatch(/^https:\/\//);
      if (p.createLink) expect(p.createLink.href, p.id).toMatch(/^https:\/\//);
      if (p.secondLink) expect(p.secondLink.href, p.id).toMatch(/^https:\/\//);
      expect(p.steps.length, p.id).toBeGreaterThan(0);
    }
  });

  it('never lists the same server twice, so a saved mailbox has one provider', () => {
    const hosts = MAILBOX_PROVIDERS.map((p) => p.server.host);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it('pairs each port with the security its provider documents', () => {
    for (const p of MAILBOX_PROVIDERS) {
      expect(p.server.security, p.id).toBe(p.server.port === '465' ? 'SSL' : 'STARTTLS');
    }
  });

  it('does not offer IMAP for a sending service', () => {
    expect(provider('resend').imapHost).toBeNull();
    expect(provider('resend').signInName).toBe('resend');
    expect(provider('resend').secretLabel).toBe('API key');
  });

  it('finds a provider by its server, and nothing for a custom one', () => {
    expect(providerByServer('smtp.gmail.com')?.id).toBe('google');
    expect(providerByServer('mail.example.invalid')).toBeUndefined();
    expect(providerById('custom')).toBeUndefined();
    expect(providerById(null)).toBeUndefined();
  });
});

describe('connectionFailureHelp', () => {
  it('gives the likely cause of a refused sign-in for each provider', () => {
    expect(connectionFailureHelp('AUTH_FAILED', provider('google'))).toMatch(/app password/);
    expect(connectionFailureHelp('AUTH_FAILED', provider('microsoft365'))).toMatch(/SMTP AUTH/);
    expect(connectionFailureHelp('AUTH_FAILED', provider('zoho'))).toMatch(/free plan/);
    expect(connectionFailureHelp('AUTH_FAILED', provider('resend'))).toMatch(/API key/);
    expect(connectionFailureHelp('AUTH_FAILED', undefined)).toMatch(/address and password/);
  });

  it('sends Zoho to its region when the server cannot be reached', () => {
    expect(connectionFailureHelp('CONNECT_FAILED', provider('zoho'))).toMatch(/Zoho region/);
    expect(connectionFailureHelp('CONNECT_FAILED', undefined)).toMatch(/typing mistakes/);
  });

  it.each<[MailboxErrorCode, RegExp]>([
    ['TLS_FAILED', /port 465 goes with SSL\/TLS/i],
    ['TIMEOUT', /did not answer in time/],
    ['REJECTED', /refused this message/],
    ['RATE_LIMITED', /sending limit/],
  ])('explains %s', (code, message) => {
    expect(connectionFailureHelp(code, undefined)).toMatch(message);
  });
});
