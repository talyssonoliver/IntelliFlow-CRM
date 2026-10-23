'use client';

/**
 * Email Settings — Module Settings (PG-207, ADR-085).
 *
 * My mailbox sits above the settings form: connecting, testing and
 * disconnecting act at once and are never part of Save (CA-1). The company
 * mailbox fallback, reply-to, tracking and bounce handling are tenant
 * settings saved together by the shell's Save; members see them read-only.
 * The suppression list is admin-only and loaded on demand (NF-005).
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from '@intelliflow/ui';
import { EMAIL_LIMITS } from '@intelliflow/domain';
import {
  mailboxAddressSchema,
  type EmailSettingsDto,
  type UpdateEmailSettingsInput,
} from '@intelliflow/validators';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { ModuleSettingsShell } from '@/components/shared/module-settings-shell';
import { EmailSettingsLoading } from './EmailSettingsLoading';
import { MyMailboxCard } from './components/MyMailboxCard';
import { CompanyMailboxCard } from './components/CompanyMailboxCard';
import { OAuthReturnNotice } from './components/OAuthReturnNotice';
import {
  BounceRulesCard,
  REPLY_TO_ID,
  ReplyToCard,
  SOFT_THRESHOLD_ID,
  SignaturesLinkCard,
  TrackingCard,
} from './components/TenantSettingsCards';

const SuppressionListCard = dynamic(
  () => import('./components/SuppressionListCard').then((m) => m.SuppressionListCard),
  {
    ssr: false,
    loading: () => (
      <p className="lg:col-span-12 text-sm text-muted-foreground">Loading the suppression list…</p>
    ),
  }
);

const READ_ONLY_NOTE_ID = 'email-settings-readonly-note';
const MIN_SOFT = EMAIL_LIMITS.minSoftBounceThreshold;
const MAX_SOFT = EMAIL_LIMITS.maxSoftBounceThreshold;

const RESET_DESCRIPTION =
  'This restores the company settings on this page to their defaults: reply-to address, tracking, bounce handling and the company mailbox fallback. Connected mailboxes, signatures and the suppression list are kept.';

interface Draft {
  allowTenantMailboxFallback: boolean;
  replyToAddress: string;
  trackOpens: boolean;
  trackClicks: boolean;
  hardBounceAction: 'SUPPRESS' | 'NONE';
  softBounceThreshold: string;
  notifySenderOnBounce: boolean;
}

type FieldKey = 'replyToAddress' | 'softBounceThreshold';
const FIELD_ID: Record<FieldKey, string> = {
  replyToAddress: REPLY_TO_ID,
  softBounceThreshold: SOFT_THRESHOLD_ID,
};
const FIELD_KEYS = Object.keys(FIELD_ID) as FieldKey[];

function toDraft(dto: EmailSettingsDto): Draft {
  return {
    allowTenantMailboxFallback: dto.allowTenantMailboxFallback,
    replyToAddress: dto.replyToAddress ?? '',
    trackOpens: dto.trackOpens,
    trackClicks: dto.trackClicks,
    hardBounceAction: dto.hardBounceAction,
    softBounceThreshold: String(dto.softBounceThreshold),
    notifySenderOnBounce: dto.notifySenderOnBounce,
  };
}

/** The update payload; '' reply-to means none (`null`). */
function toInput(draft: Draft): UpdateEmailSettingsInput {
  const reply = draft.replyToAddress.trim().toLowerCase();
  return {
    allowTenantMailboxFallback: draft.allowTenantMailboxFallback,
    replyToAddress: reply === '' ? null : reply,
    trackOpens: draft.trackOpens,
    trackClicks: draft.trackClicks,
    hardBounceAction: draft.hardBounceAction,
    softBounceThreshold: Number(draft.softBounceThreshold),
    notifySenderOnBounce: draft.notifySenderOnBounce,
  };
}

/** Normalised snapshot for dirty checks. */
const snapshot = (draft: Draft) => JSON.stringify(toInput(draft));

function clientErrors(draft: Draft): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  const reply = draft.replyToAddress.trim();
  if (reply !== '' && !mailboxAddressSchema.safeParse(reply).success) {
    errors.replyToAddress = 'Enter a valid email address.';
  }
  const threshold = Number(draft.softBounceThreshold);
  if (
    draft.softBounceThreshold.trim() === '' ||
    !Number.isInteger(threshold) ||
    threshold < MIN_SOFT ||
    threshold > MAX_SOFT
  ) {
    errors.softBounceThreshold = `Enter a whole number between ${MIN_SOFT} and ${MAX_SOFT}.`;
  }
  return errors;
}

/** Field messages from a tRPC BAD_REQUEST (`data.zodError.fieldErrors`). */
function serverFieldErrors(error: unknown): Partial<Record<FieldKey, string>> {
  const fieldErrors = (
    error as { data?: { zodError?: { fieldErrors?: Record<string, string[]> } } }
  )?.data?.zodError?.fieldErrors;
  const out: Partial<Record<FieldKey, string>> = {};
  for (const key of FIELD_KEYS) {
    const message = fieldErrors?.[key]?.[0];
    if (message) out[key] = message;
  }
  return out;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function EmailSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading;
  const utils = trpc.useUtils();
  const settingsQuery = trpc.emailSettings.get.useQuery(undefined, { enabled });
  const canEdit = settingsQuery.data?.canEdit === true;
  const mineQuery = trpc.emailMailbox.getMine.useQuery(undefined, { enabled });
  const tenantQuery = trpc.emailMailbox.getTenant.useQuery(undefined, {
    enabled: enabled && canEdit,
  });
  const updateMutation = trpc.emailSettings.update.useMutation();
  const resetMutation = trpc.emailSettings.resetToDefaults.useMutation();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [seen, setSeen] = useState<EmailSettingsDto | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [focusField, setFocusField] = useState<FieldKey | null>(null);

  // Adopt fresh server data unless the user is mid-edit.
  const data = settingsQuery.data;
  if (data && data !== seen) {
    setSeen(data);
    if (!draft || baseline === null || snapshot(draft) === baseline) {
      setDraft(toDraft(data));
      setBaseline(snapshot(toDraft(data)));
    }
  }

  useEffect(() => {
    if (!focusField) return;
    document.getElementById(FIELD_ID[focusField])?.focus();
    setFocusField(null);
  }, [focusField]);

  const adopt = (dto: EmailSettingsDto) => {
    const next = toDraft(dto);
    setDraft(next);
    setBaseline(snapshot(next));
    setServerErrors({});
  };

  const refreshMailboxes = () => {
    for (const invalidate of [
      utils.emailMailbox.getMine.invalidate,
      utils.emailMailbox.getTenant.invalidate,
      utils.emailSettings.get.invalidate,
    ]) {
      invalidate().catch((error: unknown) =>
        console.error('[email-settings] refresh failed:', error)
      );
    }
  };

  const errors = draft ? { ...clientErrors(draft), ...serverErrors } : {};
  const isDirty = draft !== null && baseline !== null && snapshot(draft) !== baseline;
  const isSaving = updateMutation.isPending || resetMutation.isPending;

  const patch = (next: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...next } : current));
    setServerErrors((current) => {
      const copy = { ...current };
      for (const key of Object.keys(next)) delete copy[key as FieldKey];
      return copy;
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaveError(null);
    // Save stays enabled while a field is invalid, so pressing it explains what to
    // fix: focus goes to the first invalid field (its message is linked to it).
    const draftErrors = clientErrors(draft);
    const invalid = FIELD_KEYS.find((key) => draftErrors[key]);
    if (invalid) {
      setFocusField(invalid);
      return;
    }
    try {
      const saved = await updateMutation.mutateAsync(toInput(draft));
      adopt(saved);
      toast({ title: 'Email settings saved' });
      utils.emailSettings.get.invalidate().catch((error: unknown) => {
        console.error('[email-settings] refresh failed:', error);
      });
    } catch (error) {
      const fields = serverFieldErrors(error);
      const first = FIELD_KEYS.find((key) => fields[key]);
      if (first) {
        setServerErrors(fields);
        setFocusField(first);
        return;
      }
      setSaveError(errorText(error, 'The settings could not be saved.'));
    }
  };

  const handleReset = async () => {
    setSaveError(null);
    try {
      adopt(await resetMutation.mutateAsync());
      toast({ title: 'Email settings reset to defaults' });
    } catch (error) {
      setSaveError(errorText(error, 'The settings could not be reset.'));
    }
  };

  const readOnlyProps = { readOnly: !canEdit, readOnlyNoteId: READ_ONLY_NOTE_ID };
  const settings = settingsQuery.data;
  const mine = mineQuery.data;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6">
        <ModuleSettingsShell
          breadcrumbs={[{ label: 'Email', href: '/email' }, { label: 'Email Settings' }]}
          title="Email Settings"
          description="The mailbox your email is sent from, and how replies and bounces are handled."
          errorTitle="Failed to load email settings"
          isLoading={authLoading || settingsQuery.isLoading || mineQuery.isLoading}
          errorMessage={settingsQuery.error?.message ?? mineQuery.error?.message ?? null}
          loadingFallback={<EmailSettingsLoading />}
          isSaving={isSaving}
          canSave={isDirty && !isSaving}
          onSave={() => void handleSave()}
          hideActions={!canEdit}
          resetOpen={resetOpen}
          onResetOpenChange={setResetOpen}
          onResetConfirm={handleReset}
          resetTitle="Reset email settings?"
          resetConfirmLabel="Reset Settings"
          resetDescription={RESET_DESCRIPTION}
          leading={
            <>
              <output aria-live="polite" className="sr-only">
                {announcement}
              </output>
              <OAuthReturnNotice />
              {saveError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                >
                  {saveError}
                </p>
              )}
              {settings && !canEdit && (
                <p id={READ_ONLY_NOTE_ID} className="text-sm text-muted-foreground">
                  Managed by your admin. Only administrators and managers can change the company
                  settings below.
                </p>
              )}
              {mine && (
                <MyMailboxCard
                  mailbox={mine.mailbox}
                  providersAvailable={mine.providersAvailable}
                  companyFallbackAddress={
                    settings?.allowTenantMailboxFallback ? settings.companyMailboxAddress : null
                  }
                  onChanged={refreshMailboxes}
                  announce={setAnnouncement}
                />
              )}
            </>
          }
        >
          {settings && draft && mine && (
            <>
              <CompanyMailboxCard
                canEdit={canEdit}
                mailbox={canEdit ? (tenantQuery.data ?? null) : null}
                providersAvailable={mine.providersAvailable}
                allowFallback={draft.allowTenantMailboxFallback}
                onAllowFallbackChange={(v) => patch({ allowTenantMailboxFallback: v })}
                companyMailboxAddress={settings.companyMailboxAddress}
                onChanged={refreshMailboxes}
                announce={setAnnouncement}
                readOnlyNoteId={READ_ONLY_NOTE_ID}
              />
              <ReplyToCard
                value={draft.replyToAddress}
                onChange={(v) => patch({ replyToAddress: v })}
                error={errors.replyToAddress}
                {...readOnlyProps}
              />
              <TrackingCard
                trackOpens={draft.trackOpens}
                trackClicks={draft.trackClicks}
                onChange={patch}
                {...readOnlyProps}
              />
              <BounceRulesCard
                value={{
                  hardBounceAction: draft.hardBounceAction,
                  softBounceThreshold: draft.softBounceThreshold,
                  notifySenderOnBounce: draft.notifySenderOnBounce,
                }}
                onChange={patch}
                thresholdError={errors.softBounceThreshold}
                min={MIN_SOFT}
                max={MAX_SOFT}
                {...readOnlyProps}
              />
              <SignaturesLinkCard />
              {canEdit && <SuppressionListCard announce={setAnnouncement} />}
            </>
          )}
        </ModuleSettingsShell>
      </div>
    </div>
  );
}
