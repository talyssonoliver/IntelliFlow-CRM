/**
 * @vitest-environment happy-dom
 *
 * Active-tenant selection (ADR-071): persistence, flag gating, header shape, healing predicate.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ACTIVE_TENANT_CHANGED_EVENT,
  ACTIVE_TENANT_COOKIE,
  ACTIVE_TENANT_HEADER,
  ACTIVE_TENANT_STORAGE_KEY,
  activeTenantHeaders,
  clearActiveTenant,
  getActiveTenantId,
  isInheritedMembershipEnabled,
  isNotAMemberError,
  isValidTenantId,
  setActiveTenantId,
} from '../active-tenant';

const FLAG = 'NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED';

function cookieValue(): string | null {
  const match = new RegExp(`(?:^|;\\s*)${ACTIVE_TENANT_COOKIE}=([^;]*)`).exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

describe('active tenant selection', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = `${ACTIVE_TENANT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    vi.stubEnv(FLAG, '1');
  });

  describe('flag', () => {
    it.each(['1', 'true', 'TRUE', ' 1 '])('is on for %j', (value) => {
      vi.stubEnv(FLAG, value);
      expect(isInheritedMembershipEnabled()).toBe(true);
    });

    it.each(['', '0', 'false', 'yes'])('is off for %j', (value) => {
      vi.stubEnv(FLAG, value);
      expect(isInheritedMembershipEnabled()).toBe(false);
    });

    it('is off when unset', () => {
      vi.unstubAllEnvs();
      delete process.env[FLAG];
      expect(isInheritedMembershipEnabled()).toBe(false);
    });

    it('sends no header and reads no selection while off, even with a stored value', () => {
      setActiveTenantId('tenant_client_1');
      vi.stubEnv(FLAG, '0');

      expect(getActiveTenantId()).toBeNull();
      expect(activeTenantHeaders()).toEqual({});
    });
  });

  describe('persistence', () => {
    it('defaults to the home tenant (null, no header)', () => {
      expect(getActiveTenantId()).toBeNull();
      expect(activeTenantHeaders()).toEqual({});
    });

    it('stores the selection in localStorage and mirrors it in the SSR cookie', () => {
      expect(setActiveTenantId('tenant_client_1')).toBe('tenant_client_1');

      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBe('tenant_client_1');
      expect(cookieValue()).toBe('tenant_client_1');
      expect(getActiveTenantId()).toBe('tenant_client_1');
    });

    it('emits x-active-tenant with the stored tenant', () => {
      setActiveTenantId('tenant_client_1');
      expect(activeTenantHeaders()).toEqual({ [ACTIVE_TENANT_HEADER]: 'tenant_client_1' });
      expect(ACTIVE_TENANT_HEADER).toBe('x-active-tenant');
    });

    it('falls back to the cookie when localStorage has nothing', () => {
      setActiveTenantId('tenant_client_1');
      localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);

      expect(getActiveTenantId()).toBe('tenant_client_1');
    });

    it('setting null returns to the home tenant and clears both copies', () => {
      setActiveTenantId('tenant_client_1');
      expect(setActiveTenantId(null)).toBeNull();

      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
      expect(cookieValue()).toBeNull();
      expect(activeTenantHeaders()).toEqual({});
    });

    it('clearActiveTenant forgets the selection', () => {
      setActiveTenantId('tenant_client_1');
      clearActiveTenant();

      expect(getActiveTenantId()).toBeNull();
    });

    it('notifies listeners in the same tab', () => {
      const listener = vi.fn();
      globalThis.addEventListener(ACTIVE_TENANT_CHANGED_EVENT, listener);
      setActiveTenantId('tenant_client_1');
      globalThis.removeEventListener(ACTIVE_TENANT_CHANGED_EVENT, listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
        tenantId: 'tenant_client_1',
      });
    });
  });

  describe('validation (a header value must be a tenant id, nothing else)', () => {
    it.each([
      ['cuid', 'cmg0abc123def456ghi789jkl', true],
      ['uuid', '3f2b8c1e-9d4a-4f6e-8a1b-2c3d4e5f6a7b', true],
      ['empty', '', false],
      ['space', 'a b', false],
      ['CRLF injection', 'abc\r\nx-evil: 1', false],
      ['semicolon', 'abc;def', false],
      ['too long', 'a'.repeat(65), false],
      ['non-string', 42, false],
    ])('%s', (_label, value, expected) => {
      expect(isValidTenantId(value)).toBe(expected);
    });

    it('refuses to store an invalid id and stores home instead', () => {
      setActiveTenantId('tenant_client_1');
      expect(setActiveTenantId('bad value\r\n')).toBeNull();

      expect(getActiveTenantId()).toBeNull();
      expect(activeTenantHeaders()).toEqual({});
    });

    it('ignores a tampered stored value', () => {
      localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, 'x\r\ny');
      expect(getActiveTenantId()).toBeNull();
    });
  });

  describe('isNotAMemberError', () => {
    it('matches error.data.reason', () => {
      expect(isNotAMemberError({ data: { code: 'FORBIDDEN', reason: 'NOT_A_MEMBER' } })).toBe(true);
    });

    it('matches the NOT_A_MEMBER: message prefix', () => {
      expect(isNotAMemberError({ message: 'NOT_A_MEMBER: no membership in this tenant' })).toBe(
        true
      );
    });

    it.each([
      [null],
      ['NOT_A_MEMBER'],
      [{ data: { reason: 'HOME_ONLY' } }],
      [{ message: 'Something NOT_A_MEMBER: in the middle' }],
      [{ data: { code: 'FORBIDDEN' } }],
    ])('does not match %j', (error) => {
      expect(isNotAMemberError(error)).toBe(false);
    });
  });
});
