'use client';

// Scheduled Reports Content — PG-201
// PageHeader + 12-col bento grid (module-settings-playbook §1): schedules list,
// tags (TagsTab via forwardRef, §4) and an honest delivery-status card. Rows live
// in report_schedules; IFC-308's BullMQ cron will read them (ADR-075).

import { useRef, useState, type ReactNode } from 'react';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '@intelliflow/domain';
import { Card, ConfirmationDialog, Skeleton, toast, Button } from '@intelliflow/ui';
import type {
  CreateReportScheduleTagInput,
  ReportScheduleTagView,
  UpdateReportScheduleTagInput,
} from '@intelliflow/validators';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import { ScheduleList, type ScheduleItem } from './components/ScheduleList';
import { ScheduleDialog, type ScheduleSubmit } from './components/ScheduleDialog';
import { TagsTab, type TagsTabHandle } from './components/TagsTab';
import ScheduledReportsLoading from './loading';

const MANAGER_ROLES: ReadonlySet<string> = new Set(ACCOUNT_OWNER_ADMIN_ROLES);

interface SectionHeadingProps {
  icon: string;
  iconClass: string;
  title: string;
  titleId: string;
  description: string;
  action?: ReactNode;
}

function SectionHeading({
  icon,
  iconClass,
  title,
  titleId,
  description,
  action,
}: Readonly<SectionHeadingProps>) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} tabIndex={-1} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function errorToast(title: string) {
  return (err: { message: string }) =>
    toast({ title, description: err.message, variant: 'destructive' });
}

type DeleteTarget =
  | { kind: 'schedule'; id: string; name: string }
  | { kind: 'tag'; id: string; name: string };

export default function ScheduledReportsContent() {
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();
  const canEdit = MANAGER_ROLES.has(user?.role ?? '');

  // ─── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const listQuery = trpc.analytics.scheduledReports.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const tagsQuery = trpc.analytics.scheduledReports.tags.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const templatesQuery = trpc.analytics.reportTemplates.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const refreshSchedules = () => utils.analytics.scheduledReports.list.invalidate();
  const refreshAll = () =>
    Promise.all([
      utils.analytics.scheduledReports.list.invalidate(),
      utils.analytics.scheduledReports.tags.list.invalidate(),
    ]);

  const createMutation = trpc.analytics.scheduledReports.create.useMutation({
    onSuccess: refreshSchedules,
    onError: errorToast('Could not create the schedule'),
  });
  const updateMutation = trpc.analytics.scheduledReports.update.useMutation({
    onSuccess: refreshSchedules,
    onError: errorToast('Could not save the schedule'),
  });
  const setActiveMutation = trpc.analytics.scheduledReports.setActive.useMutation({
    onSuccess: refreshSchedules,
    onError: errorToast('Could not change the schedule status'),
  });
  const deleteMutation = trpc.analytics.scheduledReports.delete.useMutation({
    onSuccess: refreshSchedules,
    onError: errorToast('Could not delete the schedule'),
  });
  const createTagMutation = trpc.analytics.scheduledReports.tags.create.useMutation({
    onSuccess: refreshAll,
    onError: errorToast('Could not create the tag'),
  });
  const updateTagMutation = trpc.analytics.scheduledReports.tags.update.useMutation({
    onSuccess: refreshAll,
    onError: errorToast('Could not save the tag'),
  });
  const deleteTagMutation = trpc.analytics.scheduledReports.tags.delete.useMutation({
    onSuccess: refreshAll,
    onError: errorToast('Could not delete the tag'),
  });

  // ─── Local state ───────────────────────────────────────────────────────────
  const tagsTabRef = useRef<TagsTabHandle>(null);
  const [dialog, setDialog] = useState<{
    open: boolean;
    schedule: ScheduleItem | null;
    key: number;
  }>({
    open: false,
    schedule: null,
    key: 0,
  });
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const schedules: ScheduleItem[] = listQuery.data ?? [];
  const tags: ReportScheduleTagView[] = tagsQuery.data ?? [];
  const templates = (templatesQuery.data ?? []).map((t) => ({ id: t.id, name: t.name }));
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const tagBusy =
    createTagMutation.isPending || updateTagMutation.isPending || deleteTagMutation.isPending;
  const pendingId = setActiveMutation.isPending ? (setActiveMutation.variables?.id ?? null) : null;

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const openDialog = (schedule: ScheduleItem | null) =>
    setDialog((d) => ({ open: true, schedule, key: d.key + 1 }));
  const closeDialog = () => setDialog((d) => ({ ...d, open: false }));

  async function handleSubmit(submit: ScheduleSubmit): Promise<void> {
    if (submit.kind === 'create') {
      await createMutation.mutateAsync(submit.input);
      toast({ title: 'Schedule created', description: 'The scheduled report was saved.' });
    } else {
      await updateMutation.mutateAsync(submit.input);
      toast({ title: 'Schedule saved', description: 'Your changes were saved.' });
    }
    closeDialog();
  }

  async function handleCreateTag(input: CreateReportScheduleTagInput): Promise<void> {
    await createTagMutation.mutateAsync(input);
  }

  async function handleUpdateTag(input: UpdateReportScheduleTagInput): Promise<void> {
    await updateTagMutation.mutateAsync(input);
  }

  function handleConfirmDelete(): void {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const mutation = target.kind === 'schedule' ? deleteMutation : deleteTagMutation;
    mutation.mutate(
      { id: target.id },
      {
        onSuccess: () => {
          toast({ title: target.kind === 'schedule' ? 'Schedule deleted' : 'Tag deleted' });
          setDeleteTarget(null);
          // The row (and its Delete button) is gone: keep keyboard focus in the card.
          document
            .getElementById(target.kind === 'schedule' ? 'schedules-heading' : 'tags-heading')
            ?.focus();
        },
      }
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (authLoading || listQuery.isLoading) {
    return <ScheduledReportsLoading />;
  }

  const actions: PageAction[] = [
    {
      label: 'New Schedule',
      variant: 'primary',
      onClick: () => openDialog(null),
      disabled: !canEdit,
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Analytics', href: '/analytics' },
          { label: 'Scheduled Reports' },
        ]}
        title="Scheduled Reports"
        description="Send report templates to recipients on a schedule: cadence, timezone, recipients and delivery format."
        actions={actions}
        className="mb-6"
      />

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
        <section aria-labelledby="schedules-heading" className="lg:col-span-8">
          <Card className="h-full p-4 sm:p-5">
            <SectionHeading
              icon="schedule_send"
              iconClass="bg-primary/10 text-primary"
              title="Schedules"
              titleId="schedules-heading"
              description={
                canEdit
                  ? 'Each schedule sends one report template on its own cadence.'
                  : 'Only admins and managers can change scheduled reports.'
              }
            />
            {listQuery.error ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                Failed to load scheduled reports. {listQuery.error.message}
              </p>
            ) : (
              <ScheduleList
                schedules={schedules}
                canEdit={canEdit}
                pendingId={pendingId}
                onToggle={(s, isActive) => setActiveMutation.mutate({ id: s.id, isActive })}
                onEdit={(s) => openDialog(s)}
                onDelete={(s) => setDeleteTarget({ kind: 'schedule', id: s.id, name: s.name })}
              />
            )}
          </Card>
        </section>

        <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-4">
          <section aria-labelledby="tags-heading">
            <Card className="p-4 sm:p-5">
              <SectionHeading
                icon="sell"
                iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                title="Tags"
                titleId="tags-heading"
                description="Group schedules by team or audience."
                action={
                  canEdit ? (
                    <Button size="sm" onClick={() => tagsTabRef.current?.openCreate()}>
                      New Tag
                    </Button>
                  ) : undefined
                }
              />
              {tagsQuery.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <TagsTab
                  ref={tagsTabRef}
                  tags={tags}
                  canEdit={canEdit}
                  isBusy={tagBusy}
                  onCreate={handleCreateTag}
                  onUpdate={handleUpdateTag}
                  onDelete={(tag) => setDeleteTarget({ kind: 'tag', id: tag.id, name: tag.name })}
                />
              )}
            </Card>
          </section>

          <section aria-labelledby="delivery-heading">
            <Card className="p-4 sm:p-5">
              <SectionHeading
                icon="info"
                iconClass="bg-amber-500/10 text-amber-700 dark:text-amber-400"
                title="Delivery status"
                titleId="delivery-heading"
                description="What happens to a schedule after you save it."
              />
              <p className="text-sm text-foreground" data-testid="delivery-status">
                Schedules are saved now. Automated sending is done by the report runner, which is
                not enabled yet, so no reports are emailed until it is switched on.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Active schedules show their next run time. Paused schedules are kept but not run.
              </p>
            </Card>
          </section>
        </div>
      </div>

      {dialog.open && (
        <ScheduleDialog
          key={dialog.key}
          open={dialog.open}
          onOpenChange={(open) => (open ? undefined : closeDialog())}
          schedule={dialog.schedule}
          templates={templates}
          tags={tags.filter((t) => t.isActive)}
          existingNames={schedules.map((s) => ({ id: s.id, name: s.name }))}
          isSaving={isSaving}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => (open ? undefined : setDeleteTarget(null))}
        title={deleteTarget?.kind === 'tag' ? 'Delete Tag' : 'Delete Scheduled Report'}
        description={
          deleteTarget?.kind === 'tag'
            ? `Delete the tag "${deleteTarget.name}"? It is removed from every schedule that uses it.`
            : `Delete "${deleteTarget?.name ?? ''}"? This cannot be undone.`
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
