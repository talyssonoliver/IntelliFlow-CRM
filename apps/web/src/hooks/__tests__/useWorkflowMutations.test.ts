/**
 * useWorkflowMutations Hook Tests — IFC-031
 *
 * Tests for tRPC CRUD mutation wrappers: create, update, delete, setActive.
 * Verifies success callbacks (invalidation, navigation, toast) and error paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockInvalidate = vi.fn().mockResolvedValue(undefined);
const mockGetByIdInvalidate = vi.fn().mockResolvedValue(undefined);
const mockToast = vi.fn();

// Store onSuccess/onError callbacks for each mutation so we can trigger them
const mutationCallbacks: Record<string, { onSuccess?: () => void; onError?: (err: { message?: string }) => void }> = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@intelliflow/ui', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      workflow: {
        list: { invalidate: mockInvalidate },
        getById: { invalidate: mockGetByIdInvalidate },
      },
    }),
    workflow: {
      create: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (err: { message?: string }) => void }) => {
          mutationCallbacks.create = opts;
          return {
            mutate: vi.fn((input: unknown) => {
              // Store input for assertions, then call onSuccess
              (mutationCallbacks.create as { _lastInput?: unknown })._lastInput = input;
            }),
            isPending: false,
          };
        },
      },
      update: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (err: { message?: string }) => void }) => {
          mutationCallbacks.update = opts;
          return {
            mutate: vi.fn((input: unknown) => {
              (mutationCallbacks.update as { _lastInput?: unknown })._lastInput = input;
            }),
            isPending: false,
          };
        },
      },
      delete: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (err: { message?: string }) => void }) => {
          mutationCallbacks.delete = opts;
          return {
            mutate: vi.fn((input: unknown) => {
              (mutationCallbacks.delete as { _lastInput?: unknown })._lastInput = input;
            }),
            isPending: false,
          };
        },
      },
      setActive: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (err: { message?: string }) => void }) => {
          mutationCallbacks.setActive = opts;
          return {
            mutate: vi.fn((input: unknown) => {
              (mutationCallbacks.setActive as { _lastInput?: unknown })._lastInput = input;
            }),
            isPending: false,
          };
        },
      },
    },
  },
}));

const { useWorkflowMutations } = await import('../../hooks/useWorkflowMutations');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWorkflowMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all 4 mutation objects', () => {
    const { result } = renderHook(() => useWorkflowMutations());
    expect(result.current.createMutation).toBeDefined();
    expect(result.current.updateMutation).toBeDefined();
    expect(result.current.deleteMutation).toBeDefined();
    expect(result.current.setActiveMutation).toBeDefined();
  });

  it('create onSuccess invalidates list and navigates to /cases/case-workflows', () => {
    renderHook(() => useWorkflowMutations());

    act(() => {
      mutationCallbacks.create?.onSuccess?.();
    });

    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/cases/case-workflows');
  });

  it('create onError shows destructive toast with error message', () => {
    renderHook(() => useWorkflowMutations());

    act(() => {
      mutationCallbacks.create?.onError?.({ message: 'Name already exists' });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error',
        description: 'Name already exists',
        variant: 'destructive',
      }),
    );
  });

  it('update onSuccess invalidates list and getById, shows "Workflow saved" toast', () => {
    renderHook(() => useWorkflowMutations());

    act(() => {
      (
        mutationCallbacks.update?.onSuccess as unknown as
          | ((data: unknown, vars: { id: string }) => void)
          | undefined
      )?.(undefined, { id: 'wf-42' });
    });

    // C.4: list cache invalidates so the row re-renders with new stepCount...
    expect(mockInvalidate).toHaveBeenCalled();
    // ...AND the single-workflow cache invalidates so the edit screen,
    // if opened again, doesn't show the pre-save graph.
    expect(mockGetByIdInvalidate).toHaveBeenCalledWith({ id: 'wf-42' });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Workflow saved' }),
    );
  });

  it('update onError shows destructive toast', () => {
    renderHook(() => useWorkflowMutations());

    act(() => {
      mutationCallbacks.update?.onError?.({ message: 'Validation failed' });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: 'Validation failed',
      }),
    );
  });

  it('delete onSuccess invalidates list and shows "Workflow deleted" toast', () => {
    renderHook(() => useWorkflowMutations());

    act(() => {
      mutationCallbacks.delete?.onSuccess?.();
    });

    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Workflow deleted' }),
    );
  });

  it('delete onError shows destructive toast', () => {
    renderHook(() => useWorkflowMutations());

    act(() => {
      mutationCallbacks.delete?.onError?.({ message: 'Not found' });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: 'Not found',
      }),
    );
  });

  it('setActive onSuccess invalidates list', () => {
    renderHook(() => useWorkflowMutations());

    act(() => {
      mutationCallbacks.setActive?.onSuccess?.();
    });

    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('setActive onError shows destructive toast', () => {
    renderHook(() => useWorkflowMutations());

    act(() => {
      mutationCallbacks.setActive?.onError?.({ message: 'Forbidden' });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: 'Forbidden',
      }),
    );
  });

  it('create onError uses fallback message when error.message is undefined', () => {
    renderHook(() => useWorkflowMutations());

    act(() => {
      mutationCallbacks.create?.onError?.({});
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Failed to create workflow',
      }),
    );
  });

  it('update onError uses fallback message when error.message is undefined', () => {
    renderHook(() => useWorkflowMutations());
    act(() => { mutationCallbacks.update?.onError?.({}); });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Failed to update workflow' }),
    );
  });

  it('delete onError uses fallback message when error.message is undefined', () => {
    renderHook(() => useWorkflowMutations());
    act(() => { mutationCallbacks.delete?.onError?.({}); });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Failed to delete workflow' }),
    );
  });

  it('setActive onError uses fallback message when error.message is undefined', () => {
    renderHook(() => useWorkflowMutations());
    act(() => { mutationCallbacks.setActive?.onError?.({}); });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Failed to update workflow status' }),
    );
  });

  it('each mutation has isPending property', () => {
    const { result } = renderHook(() => useWorkflowMutations());
    expect(result.current.createMutation.isPending).toBe(false);
    expect(result.current.updateMutation.isPending).toBe(false);
    expect(result.current.deleteMutation.isPending).toBe(false);
    expect(result.current.setActiveMutation.isPending).toBe(false);
  });
});
