'use client';

/**
 * Availability — Module Settings (PG-202, ADR-081).
 *
 * Firm-wide weekly hours, timezone, closures, default buffers and the daily
 * booking limit. One page-level draft is saved by a single `update`. Reads are
 * open to every user; changes are limited to admins and managers — the server
 * is authoritative, the UI only explains.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { updateAvailabilitySchema, type AvailabilityDto } from '@intelliflow/validators';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { errorCode } from '@/lib/trpc-errors';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import {
  issuePathToFieldId,
  normalize,
  toDraft,
  toUpdateInput,
  validateDraft,
  type AvailabilityDraft,
  type DraftError,
} from './availability-draft';
import { AvailabilityLoading } from './AvailabilityLoading';
import { WeeklyHoursCard, WEEKLY_HOURS_TITLE_ID } from './components/WeeklyHoursCard';
import { TimezoneCard } from './components/TimezoneCard';
import { ClosuresList, type ClosuresListHandle } from './components/ClosuresList';
import { BuffersCapCard } from './components/BuffersCapCard';
import {
  ErrorSummary,
  PageNotes,
  SERVER_ERROR_ID,
  ServerErrorBanner,
  type ServerError,
} from './components/AvailabilityBanners';

const CLOSURES_TITLE_ID = 'availability-closures-title';
const BREADCRUMBS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Availability' },
];

const RESET_DESCRIPTION =
  'This clears the saved working hours, closures and daily booking limit, so bookings go back to the built-in 07:00-19:00 rule. The timezone and buffer times are kept.';
const RESET_ANNOUNCEMENT =
  'Availability reset. Hours show the built-in 07:00-19:00 rule until you save.';

interface Snapshot {
  draft: AvailabilityDraft;
  baseline: string;
  isConfigured: boolean;
  canEdit: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Please try again.';
}

function snapshotOf(dto: AvailabilityDto): Snapshot {
  const draft = toDraft(dto);
  return {
    draft,
    baseline: normalize(draft),
    isConfigured: dto.isConfigured,
    canEdit: dto.canEdit,
  };
}

/**
 * Client checks first; once they pass, the shared Zod schema catches anything
 * left (the server runs the same schema), mapped back to the field it concerns.
 */
function collectErrors(draft: AvailabilityDraft): DraftError[] {
  const errors = validateDraft(draft);
  if (errors.length > 0) return errors;
  const parsed = updateAvailabilitySchema.safeParse(toUpdateInput(draft));
  if (parsed.success) return [];
  const mapped: DraftError[] = [];
  for (const issue of parsed.error.issues) {
    const fieldId = issuePathToFieldId(issue.path, draft);
    if (fieldId && !mapped.some((e) => e.fieldId === fieldId))
      mapped.push({ fieldId, message: issue.message });
  }
  return mapped;
}

/** The page already shows the saved data; a failed background refresh only delays the next cache update. */
function logCacheRefreshFailure(error: unknown) {
  console.error('[availability] cache refresh failed:', error);
}

function focusById(id: string) {
  document.getElementById(id)?.focus();
}

/**
 * The page draft, seeded from the query and refreshed when newly fetched data
 * arrives while the draft is clean (edits in progress are never overwritten).
 */
function useAvailabilitySnapshot(queryData: AvailabilityDto | undefined) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [seenData, setSeenData] = useState<AvailabilityDto | null>(null);
  if (queryData && queryData !== seenData) {
    setSeenData(queryData);
    const clean = !snapshot || normalize(snapshot.draft) === snapshot.baseline;
    if (clean) setSnapshot(snapshotOf(queryData));
  }
  return [snapshot, setSnapshot] as const;
}

export default function AvailabilityContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading;
  const utils = trpc.useUtils();
  const query = trpc.calendar.availability.get.useQuery(undefined, { enabled });
  const updateMutation = trpc.calendar.availability.update.useMutation();
  const resetMutation = trpc.calendar.availability.resetToDefaults.useMutation();

  const [snapshot, setSnapshot] = useAvailabilitySnapshot(query.data);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const closuresRef = useRef<ClosuresListHandle>(null);
  // Where focus goes when the Reset dialog closes (Radix would return it to the Reset button).
  const focusOnResetCloseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTarget) return;
    focusById(focusTarget);
    setFocusTarget(null);
  }, [focusTarget]);

  const draft = snapshot?.draft ?? null;
  const errors = useMemo(
    () => (submitted && draft ? collectErrors(draft) : []),
    [submitted, draft]
  );
  const errorMap = useMemo(
    () => Object.fromEntries(errors.map((e) => [e.fieldId, e.message])),
    [errors]
  );

  if (!isAuthenticated && !authLoading) return null;
  if (authLoading || query.isLoading) return <AvailabilityLoading />;

  // Between the web release and the API promote, the API has no calendar.availability yet
  // (tRPC NOT_FOUND for an unknown procedure): explain calmly instead of failing.
  if (errorCode(query.error) === 'NOT_FOUND') {
    return (
      <div className="w-full">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title="Availability"
          description="When the firm can be booked: weekly hours, closures, buffers and a daily limit, in the firm timezone."
          className="mb-6"
        />
        <output className="block rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
          Availability settings will be available after the next release.
        </output>
      </div>
    );
  }

  if (query.error || !snapshot || !draft) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-red-700 dark:text-red-300 mb-4" role="alert">
          Failed to load availability{query.error ? `: ${query.error.message}` : '.'}
        </p>
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const canEdit = snapshot.canEdit;
  const readOnly = !canEdit;
  const isDirty = normalize(draft) !== snapshot.baseline;
  const conflict = serverError?.conflict ?? false;
  const canSave =
    canEdit && !updateMutation.isPending && !conflict && (isDirty || !snapshot.isConfigured);

  const announce = (message: string) => setAnnouncement(message);
  const setDraft = (patch: Partial<AvailabilityDraft>) =>
    setSnapshot((current) =>
      current ? { ...current, draft: { ...current.draft, ...patch } } : current
    );

  const adopt = (next: AvailabilityDto) => {
    setSnapshot(snapshotOf(next));
    setSubmitted(false);
  };

  const handleSave = async () => {
    setServerError(null);
    const found = collectErrors(draft);
    if (found.length > 0) {
      setSubmitted(true);
      setFocusTarget(found[0].fieldId);
      return;
    }
    try {
      const submittedKey = normalize(draft);
      const saved = await updateMutation.mutateAsync(toUpdateInput(draft));
      // Edits made while the request was in flight stay; only the saved baseline moves.
      setSnapshot((current) => {
        const fresh = snapshotOf(saved);
        return !current || normalize(current.draft) === submittedKey
          ? fresh
          : { ...fresh, draft: current.draft };
      });
      setSubmitted(false);
      toast({ title: 'Availability saved' });
      utils.calendar.availability.get.invalidate().catch(logCacheRefreshFailure);
      setFocusTarget(WEEKLY_HOURS_TITLE_ID);
    } catch (error) {
      setServerError({ message: errorMessage(error), conflict: errorCode(error) === 'CONFLICT' });
    }
  };

  const handleReload = async () => {
    const result = await query.refetch();
    if (result.data) adopt(result.data);
    setServerError(null);
    setFocusTarget(WEEKLY_HOURS_TITLE_ID);
  };

  const confirmReset = async () => {
    setServerError(null);
    try {
      const fresh = await resetMutation.mutateAsync();
      adopt(fresh);
      announce(RESET_ANNOUNCEMENT);
      focusOnResetCloseRef.current = WEEKLY_HOURS_TITLE_ID;
      utils.calendar.availability.get.invalidate().catch(logCacheRefreshFailure);
    } catch (error) {
      setServerError({ message: errorMessage(error), conflict: false });
      focusOnResetCloseRef.current = SERVER_ERROR_ID;
    }
  };

  const { bufferBefore, bufferAfter, capEnabled, cap } = draft;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        title="Availability"
        description="When the firm can be booked: weekly hours, closures, buffers and a daily limit, in the firm timezone."
        actions={
          canEdit
            ? [
                { label: 'Reset', variant: 'secondary', onClick: () => setResetOpen(true) },
                {
                  label: 'Save Changes',
                  variant: 'primary',
                  onClick: () => void handleSave(),
                  disabled: !canSave,
                },
              ]
            : undefined
        }
        className="mb-6"
      />

      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>

      <PageNotes readOnly={readOnly} isConfigured={snapshot.isConfigured} isDirty={isDirty} />
      <ErrorSummary errors={errors} />
      <ServerErrorBanner error={serverError} onReload={() => void handleReload()} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <WeeklyHoursCard
          days={draft.days}
          onChange={(days) => setDraft({ days })}
          errors={errorMap}
          readOnly={readOnly}
          announce={announce}
        />

        <TimezoneCard
          timezone={draft.timezone}
          onChange={(timezone) => setDraft({ timezone })}
          isConfigured={snapshot.isConfigured}
          readOnly={readOnly}
          announce={announce}
          error={errorMap['availability-timezone']}
        />

        <section aria-labelledby={CLOSURES_TITLE_ID} className="lg:col-span-8">
          <Card className="h-full p-4 sm:p-5">
            <SectionHeader
              icon="event_busy"
              iconBg="bg-rose-100 dark:bg-rose-900/30"
              iconFg="text-rose-700 dark:text-rose-300"
              title="Closures"
              titleId={CLOSURES_TITLE_ID}
              headingLevel={2}
              description="All-day dates when nothing can be booked. Existing appointments on these dates are not changed."
              action={
                canEdit ? (
                  <Button
                    id="add-closure-button"
                    type="button"
                    size="sm"
                    onClick={() => closuresRef.current?.openCreate()}
                  >
                    Add Closure
                  </Button>
                ) : undefined
              }
            />
            <ClosuresList
              ref={closuresRef}
              closures={draft.closures}
              onChange={(closures) => setDraft({ closures })}
              errors={errorMap}
              readOnly={readOnly}
              announce={announce}
            />
          </Card>
        </section>

        <BuffersCapCard
          value={{ bufferBefore, bufferAfter, capEnabled, cap }}
          onChange={(patch) => setDraft(patch)}
          errors={errorMap}
          readOnly={readOnly}
        />
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset availability?"
        description={RESET_DESCRIPTION}
        confirmLabel="Reset Availability"
        onConfirm={confirmReset}
        isLoading={resetMutation.isPending}
        onCloseAutoFocus={(event) => {
          const target = focusOnResetCloseRef.current;
          if (!target) return;
          focusOnResetCloseRef.current = null;
          event.preventDefault();
          focusById(target);
        }}
      />
    </div>
  );
}
