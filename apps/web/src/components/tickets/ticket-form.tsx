'use client';

/**
 * SupportTicketForm — Support-context ticket form wrapper (PG-047)
 *
 * Composes the existing TicketForm with FileUploader for the support section.
 * Follows the same wrapper pattern as ticket-list.tsx (PG-046).
 *
 * @implements AC-002 (form validation via TicketForm)
 * @implements AC-003 (form fields via TicketForm)
 * @implements AC-004 (file upload via FileUploader)
 * @implements AC-009 (error display)
 */

import { useState } from 'react';
import { TicketForm } from './TicketForm';
import { FileUploader } from './file-uploader';

export interface SupportTicketFormProps {
  onSubmit: (data: Record<string, unknown>, files: File[]) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function SupportTicketForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: Readonly<SupportTicketFormProps>) {
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    await onSubmit(data, stagedFiles);
  };

  return (
    <TicketForm
      mode="create"
      onSubmit={handleFormSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      renderBeforeActions={
        <FileUploader
          files={stagedFiles}
          onChange={setStagedFiles}
          disabled={isSubmitting}
        />
      }
    />
  );
}
