/**
 * PG-203 DSAR — single-use tokens (spec security should-fix 1).
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { createDsarTokenPort } from '../dsar-token';

const salt = () => 'test-salt-for-dsar';

describe('createDsarTokenPort', () => {
  it('issues 43-character base64url tokens and stores only their keyed hash', () => {
    const port = createDsarTokenPort(salt);
    const { token, hash } = port.issue();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(port.issue().token).not.toBe(token);
  });

  it('derives the key as HMAC(salt, "dsar-token-v1")', () => {
    const port = createDsarTokenPort(salt);
    const { token, hash } = port.issue();
    const key = createHmac('sha256', salt()).update('dsar-token-v1').digest();
    expect(hash).toBe(createHmac('sha256', key).update(token).digest('hex'));
  });

  it('matches the right token only', () => {
    const port = createDsarTokenPort(salt);
    const { token, hash } = port.issue();
    expect(port.matches(token, hash)).toBe(true);
    expect(port.matches(port.issue().token, hash)).toBe(false);
  });

  it('never matches a cleared or missing stored hash, nor a malformed one', () => {
    const port = createDsarTokenPort(salt);
    const { token } = port.issue();
    expect(port.matches(token, null)).toBe(false);
    expect(port.matches(token, 'abc')).toBe(false);
  });

  it('invalidates every link when the salt rotates', () => {
    const { token, hash } = createDsarTokenPort(salt).issue();
    expect(createDsarTokenPort(() => 'rotated-salt').matches(token, hash)).toBe(false);
  });

  it('folds +tags and case into one cap hash, and keeps different inboxes apart', () => {
    const port = createDsarTokenPort(salt);
    const base = port.capEmailHash('ada@example.invalid');
    expect(port.capEmailHash(' Ada+news@Example.invalid ')).toBe(base);
    expect(port.capEmailHash('bob@example.invalid')).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});
