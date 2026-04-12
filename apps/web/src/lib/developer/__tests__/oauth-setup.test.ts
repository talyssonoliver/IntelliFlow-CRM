import { describe, it, expect } from 'vitest';
import { generateOAuthCredentials, isValidWebhookUrl } from '../oauth-setup';

describe('generateOAuthCredentials', () => {
  it('production env produces clientId with prefix cli_prod_', () => {
    const creds = generateOAuthCredentials('production');
    expect(creds.clientId).toMatch(/^cli_prod_/);
  });

  it('sandbox env produces clientId with prefix cli_test_', () => {
    const creds = generateOAuthCredentials('sandbox');
    expect(creds.clientId).toMatch(/^cli_test_/);
  });

  it('clientId hex portion is 32 chars [0-9a-f]{32}', () => {
    const creds = generateOAuthCredentials('production');
    const hex = creds.clientId.replace(/^cli_prod_/, '');
    expect(hex).toMatch(/^[0-9a-f]{32}$/);
  });

  it('clientId total length is prefix + 32 hex chars', () => {
    const creds = generateOAuthCredentials('sandbox');
    // cli_test_ = 9 chars, + 32 hex = 41
    expect(creds.clientId.length).toBe(9 + 32);
  });

  it('two calls produce different clientIds (uniqueness)', () => {
    const creds1 = generateOAuthCredentials('production');
    const creds2 = generateOAuthCredentials('production');
    expect(creds1.clientId).not.toBe(creds2.clientId);
  });

  it('clientSecret starts with cs_prod_ for production', () => {
    const creds = generateOAuthCredentials('production');
    expect(creds.clientSecret).toMatch(/^cs_prod_/);
  });

  it('clientSecret starts with cs_test_ for sandbox', () => {
    const creds = generateOAuthCredentials('sandbox');
    expect(creds.clientSecret).toMatch(/^cs_test_/);
  });

  it('clientSecret hex portion is 64 chars (32 bytes)', () => {
    const creds = generateOAuthCredentials('production');
    const hex = creds.clientSecret.replace(/^cs_prod_/, '');
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maskedSecret preserves prefix and last 4 chars', () => {
    const creds = generateOAuthCredentials('sandbox');
    const last4 = creds.clientSecret.slice(-4);
    expect(creds.maskedSecret).toContain('cs_test_');
    expect(creds.maskedSecret).toMatch(new RegExp(`${last4}$`));
  });

  it('maskedSecret does NOT equal clientSecret', () => {
    const creds = generateOAuthCredentials('production');
    expect(creds.maskedSecret).not.toBe(creds.clientSecret);
  });

  it('two calls produce different clientSecrets (uniqueness)', () => {
    const creds1 = generateOAuthCredentials('sandbox');
    const creds2 = generateOAuthCredentials('sandbox');
    expect(creds1.clientSecret).not.toBe(creds2.clientSecret);
  });

  it('returns object with clientId, clientSecret, maskedSecret fields', () => {
    const creds = generateOAuthCredentials('production');
    expect(creds).toHaveProperty('clientId');
    expect(creds).toHaveProperty('clientSecret');
    expect(creds).toHaveProperty('maskedSecret');
  });
});

describe('isValidWebhookUrl', () => {
  it('empty string returns null (valid — optional field)', () => {
    expect(isValidWebhookUrl('', 'production')).toBeNull();
  });

  it('valid https URL returns null for production', () => {
    expect(isValidWebhookUrl('https://example.com/webhook', 'production')).toBeNull();
  });

  it('http URL returns error for production env', () => {
    const result = isValidWebhookUrl('http://example.com/webhook', 'production');
    expect(result).toBeTruthy();
    expect(result).toContain('HTTPS');
  });

  it('http URL returns null for sandbox env (allowed)', () => {
    expect(isValidWebhookUrl('http://localhost:3000/hook', 'sandbox')).toBeNull();
  });

  it('invalid URL string returns error', () => {
    const result = isValidWebhookUrl('not-a-url', 'sandbox');
    expect(result).toBeTruthy();
  });

  it('javascript: URI returns error', () => {
    const result = isValidWebhookUrl('javascript:alert(1)', 'sandbox');
    expect(result).toBeTruthy();
  });

  it('data: URI returns error', () => {
    const result = isValidWebhookUrl('data:text/html,<h1>test</h1>', 'sandbox');
    expect(result).toBeTruthy();
  });

  it('file: URI returns error', () => {
    const result = isValidWebhookUrl('file:///etc/passwd', 'production');
    expect(result).toBeTruthy();
  });
});
