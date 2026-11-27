'use client';

/**
 * IFC-316: the stored files of an erased person that the CRM cannot delete itself (another
 * host or bucket, or an object another record still uses). The admin deletes them where they
 * live, then confirms here so they stop counting as left. The locators are shown to admins only
 * and leave the database once confirmed.
 */
import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from '@intelliflow/ui';
import type { DsarManualFileDto, DsarRequestDto } from '@intelliflow/validators/dsar';

/** The server lists, and confirms, this many files at a time (MANUAL_FILES_PAGE). */
const PAGE_SIZE = 500;

const SOURCE_LABELS: Record<DsarManualFileDto['source'], string> = {
  LEAD_FILE: 'Lead file',
  EMAIL_ATTACHMENT: 'Email attachment',
  CHAT_ATTACHMENT: 'Chat attachment',
  TICKET_ATTACHMENT: 'Ticket attachment',
};

export interface ManualFilesDialogProps {
  request: DsarRequestDto | null;
  files: DsarManualFileDto[] | null;
  pending: boolean;
  error: string | null;
  onConfirm: (fileIds: string[]) => void;
  onClose: () => void;
}

export function ManualFilesDialog({
  request,
  files,
  pending,
  error,
  onConfirm,
  onClose,
}: Readonly<ManualFilesDialogProps>) {
  const [confirmed, setConfirmed] = useState(false);

  // The tick belongs to the page it was given on: a new request or a new page of files starts
  // unticked, so the next page is never marked deleted on the strength of the last one.
  const pageKey = `${request?.id ?? ''}:${(files ?? []).map((f) => f.id).join(',')}`;
  useEffect(() => {
    setConfirmed(false);
  }, [pageKey]);

  if (!request) return null;
  const ready = files !== null;

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Files to delete by hand</DialogTitle>
          <DialogDescription>
            {`The erasure for ${request.subjectEmail} could not delete these files itself.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!ready && <output className="text-sm text-muted-foreground">Loading files</output>}
          {ready && files.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing is left to delete.</p>
          )}
          {ready && files.length > 0 && (
            <>
              <ul className="space-y-2 text-sm text-foreground">
                {files.map((file) => (
                  <li key={file.id}>
                    <span className="font-medium">{SOURCE_LABELS[file.source]}</span>
                    <span className="block break-all font-mono text-xs">{file.locator}</span>
                  </li>
                ))}
              </ul>
              {files.length >= PAGE_SIZE && (
                <p className="text-xs text-muted-foreground">
                  {`Showing the first ${PAGE_SIZE} files. The next ones appear once these are marked as deleted.`}
                </p>
              )}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="manual-files-confirm"
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                />
                <Label htmlFor="manual-files-confirm" className="text-sm font-normal leading-snug">
                  I deleted these files where they are stored.
                </Label>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Close
          </Button>
          {ready && files.length > 0 && (
            <Button
              type="button"
              disabled={pending || !confirmed}
              onClick={() => onConfirm(files.map((f) => f.id))}
            >
              {pending ? 'Working…' : 'Mark as deleted'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
