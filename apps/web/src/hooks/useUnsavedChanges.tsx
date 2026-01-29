/**
 * useUnsavedChanges Hook
 *
 * Registry for tracking dirty form state across the application.
 * Used by LogoutButton to warn users about unsaved changes.
 *
 * IMPLEMENTS: PG-018 (Logout Page) - AC5 Unsaved work warning
 *
 * @example
 * ```tsx
 * // In a form component
 * const { register, unregister } = useUnsavedChanges();
 *
 * useEffect(() => {
 *   if (isDirty) {
 *     register('leadForm');
 *   } else {
 *     unregister('leadForm');
 *   }
 *   return () => unregister('leadForm');
 * }, [isDirty]);
 *
 * // In logout button
 * const { hasUnsavedChanges, dirtyForms } = useUnsavedChanges();
 * if (hasUnsavedChanges) {
 *   // Show confirmation modal
 * }
 * ```
 */

'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';

// ============================================
// Types
// ============================================

interface UnsavedChangesContextValue {
  /** Register a form as having unsaved changes */
  register: (formName: string) => void;
  /** Unregister a form (changes saved or discarded) */
  unregister: (formName: string) => void;
  /** Whether any form has unsaved changes */
  hasUnsavedChanges: boolean;
  /** List of form names with unsaved changes */
  dirtyForms: string[];
  /** Clear all registrations */
  clearAll: () => void;
}

// ============================================
// Context
// ============================================

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null
);

// ============================================
// Provider
// ============================================

interface UnsavedChangesProviderProps {
  children: ReactNode;
}

/**
 * Provider component for unsaved changes tracking.
 * Wrap your app or authenticated layout with this provider.
 */
export function UnsavedChangesProvider({
  children,
}: UnsavedChangesProviderProps) {
  const [dirtyFormsSet, setDirtyFormsSet] = useState<Set<string>>(new Set());

  const register = useCallback((formName: string) => {
    setDirtyFormsSet((prev) => {
      if (prev.has(formName)) return prev;
      const next = new Set(prev);
      next.add(formName);
      return next;
    });
  }, []);

  const unregister = useCallback((formName: string) => {
    setDirtyFormsSet((prev) => {
      if (!prev.has(formName)) return prev;
      const next = new Set(prev);
      next.delete(formName);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setDirtyFormsSet(new Set());
  }, []);

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({
      register,
      unregister,
      hasUnsavedChanges: dirtyFormsSet.size > 0,
      dirtyForms: Array.from(dirtyFormsSet),
      clearAll,
    }),
    [register, unregister, dirtyFormsSet, clearAll]
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

/**
 * Hook to access and manage unsaved changes registry.
 *
 * @throws Error if used outside of UnsavedChangesProvider
 */
export function useUnsavedChanges(): UnsavedChangesContextValue {
  const context = useContext(UnsavedChangesContext);

  if (!context) {
    throw new Error(
      'useUnsavedChanges must be used within an UnsavedChangesProvider'
    );
  }

  return context;
}

// ============================================
// Convenience Hook for Form Integration
// ============================================

interface UseFormUnsavedChangesOptions {
  /** Unique form identifier */
  formName: string;
  /** Whether the form currently has unsaved changes */
  isDirty: boolean;
}

/**
 * Convenience hook for integrating with form libraries.
 * Automatically registers/unregisters based on dirty state.
 *
 * @example
 * ```tsx
 * const form = useForm();
 * useFormUnsavedChanges({
 *   formName: 'leadForm',
 *   isDirty: form.formState.isDirty,
 * });
 * ```
 */
export function useFormUnsavedChanges({
  formName,
  isDirty,
}: UseFormUnsavedChangesOptions): void {
  const { register, unregister } = useUnsavedChanges();

  // Register/unregister based on dirty state
  if (isDirty) {
    register(formName);
  } else {
    unregister(formName);
  }
}
