'use client';

/**
 * IFC-316: where the files kept outside the CRM's storage are, for administrators. Read-only:
 * there is no delete, confirm or mark-as-done action here. The firm deletes a file where it is
 * stored. The locations are shown for 30 days after the erasure completes, then cleared.
 */
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@intelliflow/ui';
import type { DsarKeptFileDto, DsarRequestDto } from '@intelliflow/validators/dsar';

const SOURCE_LABELS: Record<DsarKeptFileDto['source'], string> = {
  LEAD_FILE: 'Lead file',
  EMAIL_ATTACHMENT: 'Email attachment',
  CHAT_ATTACHMENT: 'Chat attachment',
  TICKET_ATTACHMENT: 'Ticket attachment',
};

export interface KeptFilesDialogProps {
  request: DsarRequestDto | null;
  files: DsarKeptFileDto[] | null;
  /** How many files the erasure kept outside the CRM in all (the list may show fewer). */
  total: number;
  error: string | null;
  onClose: () => void;
}

export function KeptFilesDialog({
  request,
  files,
  total,
  error,
  onClose,
}: Readonly<KeptFilesDialogProps>) {
  if (!request) return null;
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Files kept outside the CRM</DialogTitle>
          <DialogDescription>
            {`The erasure for ${request.subjectEmail} did not delete these files: they are not in the CRM's storage. Delete them where they are stored. This list is for reference only, and the locations are removed 30 days after the erasure completed.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {files === null && !error && (
            <output className="text-sm text-muted-foreground">Loading files</output>
          )}
          {files !== null && files.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No locations to show: they are cleared 30 days after the erasure.
            </p>
          )}
          {files !== null && files.length > 0 && total > files.length && (
            <p className="text-sm text-foreground">
              {`Showing ${files.length} of ${total} files. The other ${total - files.length} are not shown here, and their locations are removed 30 days after the erasure like the rest, so note them from the other records or the storage itself before then.`}
            </p>
          )}
          {files !== null && files.length > 0 && (
            <ul className="space-y-2 text-sm text-foreground">
              {files.map((file) => (
                <li key={file.id}>
                  <span className="font-medium">{SOURCE_LABELS[file.source]}</span>
                  <span className="block break-all font-mono text-xs">{file.locator}</span>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
