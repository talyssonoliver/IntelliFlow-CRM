'use client';

/**
 * Undo a lead-to-deal conversion (MVP-003).
 *
 * The deal page offers "Undo conversion" for a deal converted from a lead; the convert toast
 * offers "Undo" straight away. While nothing has happened to the deal since (no stage change,
 * tasks, emails, calls, files or products, and nothing on the contact created with it), undo
 * puts the lead back to Qualified and removes the deal, and that contact. Otherwise the dialog
 * says why it can no longer be undone.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  toast,
} from '@intelliflow/ui';
import { api } from '@/lib/api';
import { revalidateLeadConversionCaches } from '@/app/leads/actions';
import { revalidateDealCaches } from '@/app/deals/actions';

type UndoClient = ReturnType<typeof api.useUtils>['client'];

export const UNDONE_TOAST = {
  title: 'Conversion undone',
  description: 'The lead is back to Qualified, and the deal created from it has been removed.',
};

function logCacheFailure(error: unknown): void {
  console.warn('[UndoConversion] Cache revalidation failed:', error);
}

/**
 * Undoes the conversion through the plain client, so it still works after the page that
 * converted has navigated away (the convert toast). Resolves to the lead's id.
 */
export async function undoConversion(
  client: UndoClient,
  opportunityId: string,
  userId?: string
): Promise<string> {
  const { leadId } = await client.leadConversion.undo.mutate({ opportunityId });
  if (userId) {
    revalidateLeadConversionCaches(userId).catch(logCacheFailure);
    revalidateDealCaches(userId).catch(logCacheFailure);
  }
  return leadId;
}

function UndoConversionDialog({
  open,
  onOpenChange,
  canUndo,
  reasons,
  loading,
  pending,
  error,
  onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canUndo: boolean;
  reasons: string[];
  loading: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}>) {
  let description: string;
  if (loading) description = 'Checking whether this conversion can still be undone...';
  else if (canUndo)
    description =
      'The lead goes back to Qualified. This deal, and the contact created with it, will be removed.';
  else description = `This conversion can no longer be undone: ${reasons.join('; ')}.`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo conversion</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{canUndo ? 'Cancel' : 'Close'}</AlertDialogCancel>
          {canUndo && !loading && (
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
              disabled={pending}
            >
              {pending ? 'Undoing...' : 'Undo conversion'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The deal page's "Undo conversion" action (null for a deal not converted from a lead) and its dialog. */
export function useConversionUndo(dealId: string, userId?: string, enabled = true) {
  const router = useRouter();
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = api.leadConversion.status.useQuery(
    { opportunityId: dealId },
    { enabled: enabled && Boolean(dealId), retry: false }
  );

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      const leadId = await undoConversion(utils.client, dealId, userId);
      toast(UNDONE_TOAST);
      setOpen(false);
      router.push(`/leads/${leadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The conversion could not be undone.');
      void status.refetch();
    } finally {
      setPending(false);
    }
  };

  const action = status.data?.leadId
    ? {
        label: 'Undo conversion',
        icon: 'undo',
        onClick: () => {
          setError(null);
          setOpen(true);
          void status.refetch();
        },
      }
    : null;

  const dialog = (
    <UndoConversionDialog
      open={open}
      onOpenChange={setOpen}
      canUndo={status.data?.canUndo ?? false}
      reasons={status.data?.reasons ?? []}
      loading={status.isFetching}
      pending={pending}
      error={error}
      onConfirm={() => void confirm()}
    />
  );
  return { action, dialog };
}
