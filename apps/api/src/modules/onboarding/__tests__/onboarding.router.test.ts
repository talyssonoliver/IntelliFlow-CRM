/**
 * Onboarding Router Tests
 *
 * @implements incident 2026-06-16 onboarding redesign
 *
 * Coverage:
 *   A. getState  — reads user_metadata correctly
 *   B. getState  — handles absent metadata (new user)
 *   C. getState  — propagates supabaseAdmin errors
 *   D. complete  — sets onboarding_completed=true
 *   E. complete  — sets selectedPlan when provided
 *   F. complete  — idempotent on repeat call
 *   G. complete  — propagates supabaseAdmin errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ============================================================
// Hoist mocks so vi.mock factory can reference them
// ============================================================

const { mockSupabaseAdmin } = vi.hoisted(() => ({
  mockSupabaseAdmin: {
    auth: {
      admin: {
        getUserById: vi.fn(),
        updateUserById: vi.fn(),
      },
    },
  },
}));

vi.mock('../../../lib/supabase', () => ({
  supabaseAdmin: mockSupabaseAdmin,
  // Re-export other named exports used transitively (e.g. by trpc.ts) as no-ops
  signIn: vi.fn(),
  signOutUser: vi.fn(),
  getSession: vi.fn(),
  verifyToken: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUserPassword: vi.fn(),
}));

// ============================================================
// Import router AFTER mocks
// ============================================================

import { onboardingRouter } from '../onboarding.router';
import { createTestContext } from '../../../test/setup';

// ============================================================
// Helpers
// ============================================================

function makeGetUserByIdResponse(metadata: Record<string, unknown> = {}) {
  return {
    data: {
      user: {
        id: 'auth-user-id',
        user_metadata: metadata,
      },
    },
    error: null,
  };
}

function makeUpdateResponse(error: { message: string } | null = null) {
  return { data: {}, error };
}

// ============================================================
// A & B. getState — happy path
// ============================================================

describe('onboarding.getState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns completed=false and selectedPlan=null for a brand-new user (no metadata)', async () => {
    mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue(makeGetUserByIdResponse({}));

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);
    const result = await caller.getState();

    expect(result).toEqual({ completed: false, selectedPlan: null });
  });

  it('returns completed=true when onboarding_completed is set in metadata', async () => {
    mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue(
      makeGetUserByIdResponse({ onboarding_completed: true })
    );

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);
    const result = await caller.getState();

    expect(result.completed).toBe(true);
  });

  it('returns selectedPlan from metadata', async () => {
    mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue(
      makeGetUserByIdResponse({
        onboarding_completed: true,
        onboarding_selected_plan: 'PROFESSIONAL',
      })
    );

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);
    const result = await caller.getState();

    expect(result.completed).toBe(true);
    expect(result.selectedPlan).toBe('PROFESSIONAL');
  });

  it('passes the userId from ctx.user to getUserById', async () => {
    mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue(makeGetUserByIdResponse());

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);
    await caller.getState();

    expect(mockSupabaseAdmin.auth.admin.getUserById).toHaveBeenCalledWith(ctx.user!.userId);
  });

  // ============================================================
  // C. getState — error propagation
  // ============================================================

  it('throws INTERNAL_SERVER_ERROR when supabaseAdmin.auth.admin.getUserById errors', async () => {
    mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
      data: { user: null },
      error: { message: 'Service unavailable' },
    });

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);

    await expect(caller.getState()).rejects.toThrow(TRPCError);

    try {
      await caller.getState();
    } catch (err) {
      expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
      expect((err as TRPCError).message).toContain('Service unavailable');
    }
  });

  it('throws NOT_FOUND when user is not found in Supabase', async () => {
    mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);

    await expect(caller.getState()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ============================================================
// D–G. complete
// ============================================================

describe('onboarding.complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets onboarding_completed=true and returns success', async () => {
    mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue(makeUpdateResponse());

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);
    const result = await caller.complete({});

    expect(result).toEqual({ success: true });
    expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
      ctx.user!.userId,
      expect.objectContaining({
        user_metadata: expect.objectContaining({ onboarding_completed: true }),
      })
    );
  });

  it('includes selectedPlan in metadata when provided', async () => {
    mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue(makeUpdateResponse());

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);
    await caller.complete({ selectedPlan: 'ENTERPRISE' });

    expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
      ctx.user!.userId,
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          onboarding_completed: true,
          onboarding_selected_plan: 'ENTERPRISE',
        }),
      })
    );
  });

  it('does not include onboarding_selected_plan key when selectedPlan is omitted', async () => {
    mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue(makeUpdateResponse());

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);
    await caller.complete({});

    const callArg = mockSupabaseAdmin.auth.admin.updateUserById.mock.calls[0][1];
    expect(callArg.user_metadata).not.toHaveProperty('onboarding_selected_plan');
  });

  it('is idempotent — second call also returns success', async () => {
    mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue(makeUpdateResponse());

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);

    await caller.complete({ selectedPlan: 'STARTER' });
    const result2 = await caller.complete({ selectedPlan: 'STARTER' });

    expect(result2).toEqual({ success: true });
    expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledTimes(2);
  });

  it('throws INTERNAL_SERVER_ERROR when supabaseAdmin.auth.admin.updateUserById errors', async () => {
    mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue(
      makeUpdateResponse({ message: 'Write failed' })
    );

    const ctx = createTestContext();
    const caller = onboardingRouter.createCaller(ctx as any);

    await expect(caller.complete({})).rejects.toThrow(TRPCError);

    try {
      await caller.complete({});
    } catch (err) {
      expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
      expect((err as TRPCError).message).toContain('Write failed');
    }
  });
});
