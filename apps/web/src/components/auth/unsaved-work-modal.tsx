/**
 * UnsavedWorkModal Component
 *
 * Confirmation dialog shown when user attempts to logout
 * while having unsaved changes in CRM forms.
 *
 * IMPLEMENTS: PG-018 (Logout Page)
 * - AC5: Unsaved work warning
 * - AC9: Accessibility
 *
 * @example
 * ```tsx
 * <UnsavedWorkModal
 *   open={showModal}
 *   dirtyForms={['Lead Form', 'Contact Form']}
 *   onSaveAndLogout={() => saveAll().then(logout)}
 *   onLogoutWithoutSaving={logout}
 *   onCancel={() => setShowModal(false)}
 * />
 * ```
 */

'use client';

import { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from '@intelliflow/ui';

// ============================================
// Types
// ============================================

export interface UnsavedWorkModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** List of form names with unsaved changes */
  dirtyForms: string[];
  /** Called when user chooses to save and logout */
  onSaveAndLogout: () => void;
  /** Called when user chooses to logout without saving */
  onLogoutWithoutSaving: () => void;
  /** Called when user cancels (closes modal) */
  onCancel: () => void;
}

// ============================================
// Component
// ============================================

/**
 * Modal dialog warning about unsaved changes before logout
 */
export function UnsavedWorkModal({
  open,
  dirtyForms,
  onSaveAndLogout,
  onLogoutWithoutSaving,
  onCancel,
}: UnsavedWorkModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button when modal opens for accessibility
  useEffect(() => {
    if (open && cancelButtonRef.current) {
      cancelButtonRef.current.focus();
    }
  }, [open]);

  // Handle escape key
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onCancel();
    }
  };

  // Format the list of dirty forms for display
  const formatDirtyForms = () => {
    if (dirtyForms.length === 0) {
      return 'some forms';
    }
    if (dirtyForms.length === 1) {
      return dirtyForms[0];
    }
    if (dirtyForms.length === 2) {
      return `${dirtyForms[0]} and ${dirtyForms[1]}`;
    }
    const lastForm = dirtyForms[dirtyForms.length - 1];
    const otherForms = dirtyForms.slice(0, -1).join(', ');
    return `${otherForms}, and ${lastForm}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        aria-describedby="unsaved-work-description"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined h-5 w-5 text-amber-500 text-xl" aria-hidden="true">
              warning
            </span>
            <DialogTitle>Unsaved Changes</DialogTitle>
          </div>
        </DialogHeader>

        <DialogDescription id="unsaved-work-description" className="py-4">
          You have unsaved changes in: <strong>{formatDirtyForms()}</strong>.
          <br />
          <br />
          What would you like to do?
        </DialogDescription>

        {dirtyForms.length > 0 && (
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Forms with unsaved changes:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              {dirtyForms.map((form) => (
                <li key={form}>{form}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            ref={cancelButtonRef}
            variant="outline"
            onClick={onCancel}
            aria-label="Cancel and return to editing"
          >
            Cancel
          </Button>

          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={onLogoutWithoutSaving}
              aria-label="Logout without saving your changes"
            >
              Logout Without Saving
            </Button>

            <Button
              variant="default"
              onClick={onSaveAndLogout}
              aria-label="Save your changes and then logout"
            >
              Save & Logout
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
