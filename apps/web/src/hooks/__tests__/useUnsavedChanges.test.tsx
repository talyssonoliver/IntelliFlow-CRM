/**
 * Tests for useUnsavedChanges hook
 *
 * @module apps/web/src/hooks/__tests__/useUnsavedChanges.test.ts
 * IMPLEMENTS: PG-018 (Logout Page) - AC5 Unsaved work warning
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import {
  useUnsavedChanges,
  UnsavedChangesProvider,
} from '../useUnsavedChanges';

// Wrapper component for testing with context
function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <UnsavedChangesProvider>{children}</UnsavedChangesProvider>;
  };
}

describe('useUnsavedChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registration', () => {
    it('should register a form as having unsaved changes', () => {
      const { result } = renderHook(() => useUnsavedChanges(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.register('leadForm');
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
      expect(result.current.dirtyForms).toContain('leadForm');
    });

    it('should unregister a form when changes are saved', () => {
      const { result } = renderHook(() => useUnsavedChanges(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.register('leadForm');
      });

      expect(result.current.hasUnsavedChanges).toBe(true);

      act(() => {
        result.current.unregister('leadForm');
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
      expect(result.current.dirtyForms).not.toContain('leadForm');
    });

    it('should track multiple forms independently', () => {
      const { result } = renderHook(() => useUnsavedChanges(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.register('leadForm');
        result.current.register('contactForm');
      });

      expect(result.current.dirtyForms).toHaveLength(2);
      expect(result.current.dirtyForms).toContain('leadForm');
      expect(result.current.dirtyForms).toContain('contactForm');

      act(() => {
        result.current.unregister('leadForm');
      });

      expect(result.current.dirtyForms).toHaveLength(1);
      expect(result.current.dirtyForms).toContain('contactForm');
    });
  });

  describe('dirty state detection', () => {
    it('should return hasUnsavedChanges=true when any form is dirty', () => {
      const { result } = renderHook(() => useUnsavedChanges(), {
        wrapper: createWrapper(),
      });

      expect(result.current.hasUnsavedChanges).toBe(false);

      act(() => {
        result.current.register('taskForm');
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it('should return hasUnsavedChanges=false when no forms are dirty', () => {
      const { result } = renderHook(() => useUnsavedChanges(), {
        wrapper: createWrapper(),
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
      expect(result.current.dirtyForms).toHaveLength(0);
    });

    it('should return list of dirty form names', () => {
      const { result } = renderHook(() => useUnsavedChanges(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.register('leadForm');
        result.current.register('opportunityForm');
        result.current.register('contactForm');
      });

      expect(result.current.dirtyForms).toEqual(
        expect.arrayContaining(['leadForm', 'opportunityForm', 'contactForm'])
      );
    });
  });

  describe('cleanup', () => {
    it('should clear all registrations on clearAll()', () => {
      const { result } = renderHook(() => useUnsavedChanges(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.register('leadForm');
        result.current.register('contactForm');
        result.current.register('taskForm');
      });

      expect(result.current.dirtyForms).toHaveLength(3);

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
      expect(result.current.dirtyForms).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle registering the same form multiple times', () => {
      const { result } = renderHook(() => useUnsavedChanges(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.register('leadForm');
        result.current.register('leadForm');
        result.current.register('leadForm');
      });

      // Should only appear once
      expect(result.current.dirtyForms).toHaveLength(1);
    });

    it('should handle unregistering a non-existent form', () => {
      const { result } = renderHook(() => useUnsavedChanges(), {
        wrapper: createWrapper(),
      });

      // Should not throw
      act(() => {
        result.current.unregister('nonExistent');
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
    });
  });
});
