// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { MailboxErrorCode } from '@intelliflow/domain';
import { connectionFailureHelp } from '../connection-help';
import {
  isPersonalMicrosoftAddress,
  MAILBOX_PROVIDERS,
  oneClickNotYet,
  providerById,
  providerByServer,
} from '../mailbox-providers';

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

  it('has no settings for personal Microsoft mail, which no password can reach', () => {
    expect(providerById('microsoft-personal')).toBeUndefined();
    expect(MAILBOX_PROVIDERS.some((p) => p.server.host === 'smtp-mail.outlook.com')).toBe(false);
  });

  it.each([
    ['pat@outlook.com', true],
    ['pat@hotmail.co.uk', true],
    ['PAT@Live.com', true],
    ['pat@msn.com', true],
    ['pat@outlook.example.invalid', false],
    ['pat@live.acme.example', false],
    ['pat@live.co.uk', true],
    ['pat@outlook.com.br', true],
    ['pat@company.example.invalid', false],
    ['pat@mylive.example.invalid', false],
  ])('recognises %s as a personal Microsoft address: %s', (address, expected) => {
    expect(isPersonalMicrosoftAddress(address)).toBe(expected);
  });

  it('keeps the wording for what is not offered yet in one place, with no date', () => {
    expect(oneClickNotYet('Microsoft')).toBe("One-click Microsoft sign-in isn't available yet.");
  });

  it('does not read incoming mail through Microsoft 365 with a password', () => {
    expect(provider('microsoft365').imapHost).toBeNull();
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
