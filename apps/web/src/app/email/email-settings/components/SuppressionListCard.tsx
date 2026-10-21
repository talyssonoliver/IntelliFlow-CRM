'use client';

/**
 * Suppression list (PG-207, admin only, loaded on demand): addresses that are
 * skipped when anyone in the tenant sends. Bounce handling adds them; admins
 * can add or remove one by hand.
 */
import { useRef, useState, type FormEvent } from 'react';
import { Button, Card, ConfirmationDialog, EmptyState, Input, Label } from '@intelliflow/ui';
import { mailboxAddressSchema, type SuppressionDto } from '@intelliflow/validators';
import { trpc } from '@/lib/trpc';
import { SectionHeader } from '@/components/shared/section-header';

const TITLE_ID = 'email-settings-suppression-title';
const INPUT_ID = 'email-settings-suppression-email';
const PAGE_SIZE = 50;

const REASON_LABEL: Record<SuppressionDto['reason'], string> = {
  HARD_BOUNCE: 'Hard bounce',
  SOFT_BOUNCE_LIMIT: 'Repeated soft bounces',
  MANUAL: 'Added manually',
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface SuppressionListCardProps {
  announce: (message: string) => void;
}

export function SuppressionListCard({ announce }: Readonly<SuppressionListCardProps>) {
  const utils = trpc.useUtils();
  const list = trpc.emailSettings.suppression.list.useInfiniteQuery(
    { limit: PAGE_SIZE },
    { getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor ?? undefined }
  );
  const add = trpc.emailSettings.suppression.add.useMutation();
  const remove = trpc.emailSettings.suppression.remove.useMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<SuppressionDto | null>(null);

  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () => {
    utils.emailSettings.suppression.list.invalidate().catch((error: unknown) => {
      console.error('[email-settings] suppression refresh failed:', error);
    });
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    const parsed = mailboxAddressSchema.safeParse(email);
    if (!parsed.success) {
      setInputError('Enter a valid email address.');
      inputRef.current?.focus();
      return;
    }
    setInputError(null);
    try {
      const row = await add.mutateAsync({ email: parsed.data });
      setEmail('');
      announce(`${row.email} added to the suppression list.`);
      refresh();
    } catch (error) {
      setServerError(errorText(error, 'The address could not be added.'));
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemoval) return;
    setServerError(null);
    try {
      await remove.mutateAsync({ id: pendingRemoval.id });
      announce(`${pendingRemoval.email} removed from the suppression list.`);
      refresh();
    } catch (error) {
      setServerError(errorText(error, 'The address could not be removed.'));
    }
  };

  return (
    <section aria-labelledby={TITLE_ID} className="lg:col-span-12">
      <Card className="p-4 sm:p-5 space-y-4">
        <SectionHeader
          icon="block"
          iconBg="bg-rose-100 dark:bg-rose-900/30"
          iconFg="text-rose-700 dark:text-rose-300"
          title="Suppression list"
          titleId={TITLE_ID}
          headingLevel={2}
          description="Addresses that are skipped when anyone sends. Bounced addresses are added automatically."
        />

        <form
          noValidate
          onSubmit={(e) => void handleAdd(e)}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="space-y-1.5 grow min-w-[16rem]">
            <Label htmlFor={INPUT_ID}>Email address</Label>
            <Input
              ref={inputRef}
              id={INPUT_ID}
              type="email"
              value={email}
              autoComplete="off"
              aria-invalid={inputError ? true : undefined}
              aria-describedby={inputError ? `${INPUT_ID}-error` : undefined}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            {inputError && (
              <p id={`${INPUT_ID}-error`} className="text-xs text-red-700 dark:text-red-300">
                {inputError}
              </p>
            )}
          </div>
          <Button type="submit" size="sm" disabled={add.isPending}>
            Add Address
          </Button>
        </form>

        {serverError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {serverError}
          </p>
        )}

        {list.error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            The suppression list could not be loaded.
          </p>
        )}

        {!list.error && !list.isLoading && rows.length === 0 && (
          <EmptyState
            entity="emails"
            size="sm"
            phase="passive"
            title="No suppressed addresses"
            description="Addresses that hard-bounce, or that you add here, are skipped when anyone sends."
            className="py-4 px-3 gap-2"
          />
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground break-all">{row.email}</p>
                  <p className="text-xs text-muted-foreground">{REASON_LABEL[row.reason]}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${row.email}`}
                  onClick={() => setPendingRemoval(row)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {list.hasNextPage && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Show More
          </Button>
        )}
      </Card>

      <ConfirmationDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        title="Remove from suppression list?"
        description={`Email to ${pendingRemoval?.email ?? 'this address'} will be sent again. Its earlier bounces stop counting towards the limit.`}
        confirmLabel="Remove Address"
        variant="destructive"
        onConfirm={confirmRemove}
        isLoading={remove.isPending}
      />
    </section>
  );
}
