/**
 * @vitest-environment happy-dom
 *
 * Logout must forget the active-tenant selection (ADR-071): a selection that outlives the
 * session would be sent for the next user on this browser and fail with NOT_A_MEMBER.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanupSession, clearLocalStorage } from '../session-cleanup';
import {
  ACTIVE_TENANT_COOKIE,
  ACTIVE_TENANT_STORAGE_KEY,
  getActiveTenantId,
  setActiveTenantId,
} from '@/lib/tenant/active-tenant';

describe('session cleanup and the active tenant', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED', '1');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    setActiveTenantId('tenant_client_1');
  });

  it('cleanupSession clears the selection from localStorage and the SSR cookie', async () => {
    expect(getActiveTenantId()).toBe('tenant_client_1');

    await cleanupSession();

    expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
    expect(document.cookie).not.toContain(`${ACTIVE_TENANT_COOKIE}=tenant_client_1`);
    expect(getActiveTenantId()).toBeNull();
  });

  it('clears it even when preferences are preserved (the default)', async () => {
    localStorage.setItem('intelliflow_theme', 'dark');

    await cleanupSession({ preservePreferences: true });

    expect(localStorage.getItem('intelliflow_theme')).toBe('dark');
    expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
  });

  it('clearLocalStorage on its own also removes the selection key', () => {
    const cleared = clearLocalStorage(true);

    expect(cleared).toContain(ACTIVE_TENANT_STORAGE_KEY);
    expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
  });

  it('leaves the selection alone when neither storage nor cookies are being cleared', async () => {
    await cleanupSession({
      clearLocalStorage: false,
      clearCookies: false,
      clearSessionStorage: false,
      clearIndexedDB: false,
      broadcastLogout: false,
    });

    expect(getActiveTenantId()).toBe('tenant_client_1');
  });
});
