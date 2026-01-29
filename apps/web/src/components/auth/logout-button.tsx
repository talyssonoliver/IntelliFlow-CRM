/**
 * LogoutButton Component
 *
 * Main logout trigger component with unsaved work detection.
 * Shows confirmation modal if there are unsaved changes.
 *
 * IMPLEMENTS: PG-018 (Logout Page)
 * - AC1: User can initiate logout from sidebar menu
 * - AC5: Unsaved work warning
 * - AC9: Accessibility
 *
 * @example
 * ```tsx
 * // Basic usage in sidebar
 * <LogoutButton />
 *
 * // With custom styling
 * <LogoutButton variant="ghost" className="w-full justify-start" />
 *
 * // With callbacks
 * <LogoutButton
 *   onLogoutStart={() => console.log('Starting logout...')}
 *   onLogoutComplete={() => console.log('Logout complete')}
 * />
 * ```
 */

'use client';

import { useState, ReactNode } from 'react';
import { Button, type ButtonProps } from '@intelliflow/ui';
import { useLogout } from '@/hooks/useLogout';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { UnsavedWorkModal } from './unsaved-work-modal';

// ============================================
// Types
// ============================================

export interface LogoutButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Called when logout starts */
  onLogoutStart?: () => void;
  /** Called when logout completes (success or error) */
  onLogoutComplete?: () => void;
  /** Custom children (default: "Sign out") */
  children?: ReactNode;
}

// ============================================
// Component
// ============================================

/**
 * Logout button with unsaved work detection
 */
export function LogoutButton({
  variant = 'ghost',
  className,
  onLogoutStart,
  onLogoutComplete,
  children,
  ...buttonProps
}: LogoutButtonProps) {
  const { logout, isLoggingOut } = useLogout();
  const { hasUnsavedChanges, dirtyForms, clearAll } = useUnsavedChanges();
  const [showModal, setShowModal] = useState(false);

  /**
   * Handle button click - show modal if unsaved changes, otherwise logout
   */
  const handleClick = () => {
    if (hasUnsavedChanges) {
      setShowModal(true);
    } else {
      handleLogout();
    }
  };

  /**
   * Execute the logout flow
   */
  const handleLogout = async () => {
    onLogoutStart?.();

    try {
      await logout();
    } finally {
      onLogoutComplete?.();
    }
  };

  /**
   * Handle "Logout Without Saving" from modal
   */
  const handleLogoutWithoutSaving = () => {
    setShowModal(false);
    clearAll(); // Clear the unsaved changes registry
    handleLogout();
  };

  /**
   * Handle "Save & Logout" from modal
   * Note: Actual save implementation would need to be provided by the app
   */
  const handleSaveAndLogout = async () => {
    // TODO: In a real implementation, this would trigger save for all dirty forms
    // For now, we just clear and logout
    setShowModal(false);
    clearAll();
    handleLogout();
  };

  /**
   * Handle modal cancel
   */
  const handleCancel = () => {
    setShowModal(false);
  };

  return (
    <>
      <Button
        variant={variant}
        className={className}
        onClick={handleClick}
        disabled={isLoggingOut}
        aria-label="Sign out"
        aria-busy={isLoggingOut}
        data-testid="logout-button"
        {...buttonProps}
      >
        {isLoggingOut ? (
          <>
            <span className="material-symbols-outlined mr-2 h-4 w-4 animate-spin text-base" aria-hidden="true">
              progress_activity
            </span>
            <span>Signing out...</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined mr-2 h-4 w-4 text-base" aria-hidden="true">
              logout
            </span>
            <span>{children ?? 'Sign out'}</span>
          </>
        )}
      </Button>

      <UnsavedWorkModal
        open={showModal}
        dirtyForms={dirtyForms}
        onCancel={handleCancel}
        onLogoutWithoutSaving={handleLogoutWithoutSaving}
        onSaveAndLogout={handleSaveAndLogout}
      />
    </>
  );
}
