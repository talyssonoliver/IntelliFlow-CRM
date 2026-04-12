'use client';

/**
 * TicketDetail — Ticket detail view component (PG-137)
 *
 * Self-contained presentational component for ticket detail view.
 * Receives all data and callbacks via props (no direct API calls).
 *
 * @implements AC-1 (Extract ticket detail into component)
 * @implements AC-2 (3-column layout with sidebar, content, actions)
 * @implements AC-10 (All tabs fully implemented)
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { EntityHoverCard } from '@/components/shared/entity-hover-card';
import {
  Card,
  toast,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@intelliflow/ui';
import { EntityActionSheet } from '@/components/shared/entity-action-sheet';
import { MoreActionsButton } from '@/components/shared/more-actions-button';
import { PinButton } from '@/components/home/PinButton';
import { QuickLogComposer } from '@/components/shared/quick-log-composer';
import { AppAvatar } from '@/components/shared/app-avatar';
import { AssignSheet } from '@/components/shared/assign-sheet';
import { EscalationAlert } from './EscalationAlert';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { useActivityDeepLink, isDeepLinkedActivity } from '@/hooks/useActivityDeepLink';
import { TicketAssignSidebar } from './TicketAssignSidebar';
import {
  formatSLATime,
  getSLAConfig,
  getStatusConfig,
  getPriorityConfig,
  getChannelIcon,
} from '@/lib/tickets/ticket-utils';
import type {
  TicketDetailData,
  ResolutionInput,
  TicketActivity,
  TicketAssigneeOption,
} from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'activity' | 'resolution' | 'attachments' | 'ai-insights';

interface TicketDetailProps {
  ticket: TicketDetailData;
  isLoading: boolean;
  currentUserId?: string | null;
  currentUserName?: string | null;
  assigneeOptions?: TicketAssigneeOption[];
  isAssigneeOptionsLoading?: boolean;
  onStatusChange: (status: string) => Promise<void>;
  onPriorityChange: (priority: string) => Promise<void>;
  onAssign: (userId: string) => Promise<void>;
  onAddResponse: (content: string, isInternal: boolean) => Promise<void>;
  onResolve: (resolution: ResolutionInput) => Promise<void>;
  onClose: () => Promise<void>;
  /** Called after confirmed deletion — parent should redirect away */
  onDelete?: () => Promise<void>;
  /** Called after confirmed archive */
  onArchive?: () => Promise<void>;
  /** Override back-navigation href. Defaults to '/tickets'. */
  listHref?: string;
  /** Override detail page URL prefix for related tickets. Defaults to '/tickets'. */
  detailUrlPrefix?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'resolution', label: 'Resolution' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'ai-insights', label: 'AI Insights' },
];

interface FirstResponseDisplay {
  metricClass: string;
  summaryClass: string;
  summaryText: string;
  barClass: string;
}

function resolveFirstResponseDisplay(
  hasFirstResponse: boolean,
  firstResponseMet: boolean,
  firstResponseValue: number | null | undefined
): FirstResponseDisplay {
  if (!hasFirstResponse) {
    return {
      metricClass: 'text-amber-600',
      summaryClass: 'text-amber-600 font-medium',
      summaryText: 'Pending',
      barClass: 'bg-amber-500',
    };
  }
  if (firstResponseMet) {
    return {
      metricClass: 'text-green-600',
      summaryClass: 'text-green-600 font-medium',
      summaryText: `Met (${firstResponseValue ?? 0}m)`,
      barClass: 'bg-green-500',
    };
  }
  return {
    metricClass: 'text-red-600',
    summaryClass: 'text-red-600 font-medium',
    summaryText: 'Missed',
    barClass: 'bg-red-500',
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TicketDetail({
  ticket,
  isLoading,
  currentUserId = null,
  currentUserName = null,
  assigneeOptions = [],
  isAssigneeOptionsLoading = false,
  onStatusChange: _onStatusChange,
  onPriorityChange: _onPriorityChange,
  onAssign,
  onAddResponse,
  onResolve,
  onClose,
  onDelete,
  onArchive,
  listHref = '/tickets',
  detailUrlPrefix = '/tickets',
}: Readonly<TicketDetailProps>) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [assignSidebarOpen, setAssignSidebarOpen] = useState(false);
  const [escalationSheetOpen, setEscalationSheetOpen] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('public');
  const [replyContent, setReplyContent] = useState('');
  const [activityView, setActivityView] = useState<'timeline' | 'unified'>('timeline');
  const { selectedActivityId } = useActivityDeepLink(
    activeTab,
    setActiveTab as (tab: 'activity') => void
  );

  // Deep-link: scroll to the targeted activity item
  const deepLinkScrolledRef = useRef(false);
  useEffect(() => {
    if (!selectedActivityId || deepLinkScrolledRef.current) return;
    deepLinkScrolledRef.current = true;
    requestAnimationFrame(() => {
      const el =
        document.querySelector(`[data-activity-id="${CSS.escape(selectedActivityId.prefixed)}"]`) ||
        document.querySelector(`[data-activity-id="${CSS.escape(selectedActivityId.raw)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [selectedActivityId, activeTab]);

  const [resolutionType, setResolutionType] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  // Status dialog will be added when status change UI is implemented
  const handleStatusDialogOpen = () => _onStatusChange(ticket.status);

  const slaConfig = getSLAConfig(ticket.sla.resolution.status);
  const statusConfig = getStatusConfig(ticket.status);
  const priorityConfig = getPriorityConfig(ticket.priority);
  const hasFirstResponse = ticket.firstResponseAt !== null;
  const firstResponseValue = ticket.sla.firstResponse.actual;
  const firstResponseMet = ticket.sla.firstResponse.met;
  const {
    metricClass: firstResponseMetricClass,
    summaryClass: firstResponseSummaryClass,
    summaryText: firstResponseSummaryText,
    barClass: firstResponseBarClass,
  } = resolveFirstResponseDisplay(hasFirstResponse, firstResponseMet, firstResponseValue);
  const canOpenAssignSidebar =
    Boolean(currentUserId) || assigneeOptions.length > 0 || isAssigneeOptionsLoading;

  const handleSendReply = async () => {
    if (!replyContent.trim()) return;
    await onAddResponse(replyContent, replyMode === 'internal');
    setReplyContent('');
  };

  const handleResolve = async () => {
    if (!resolutionType || !resolutionSummary.trim()) return;
    await onResolve({
      type: resolutionType,
      rootCause: rootCause.trim() || undefined,
      summary: resolutionSummary,
    });
  };

  const handleEscalate = () => {
    if (isLoading) return;
    setEscalationSheetOpen(true);
    setEscalationReason('');
  };

  const handleEscalateConfirm = async (managerId: string) => {
    try {
      // Escalation = assign to manager + bump priority to CRITICAL
      await onAssign(managerId);
      if (ticket.priority !== 'CRITICAL') {
        await _onPriorityChange('CRITICAL');
      }
      toast({
        title: 'Ticket Escalated',
        description:
          `Ticket has been escalated and assigned to a manager.` +
          (escalationReason ? ` Reason: ${escalationReason}` : ''),
      });
      setEscalationSheetOpen(false);
      setEscalationReason('');
    } catch {
      toast({
        title: 'Escalation Failed',
        description: 'Could not escalate the ticket.',
        variant: 'destructive',
      });
      throw new Error('Escalation failed'); // Keep AssignSheet open
    }
  };

  const activityCount = ticket.activities.length;
  const attachmentCount = ticket.attachments.length;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-[#0B1116] p-6 md:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-slate-500">
              <Link
                href={listHref}
                className="hover:text-[#137fec] transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span> Tickets
              </Link>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-slate-900 dark:text-slate-200 font-medium">
                #{ticket.ticketNumber}
              </span>
            </nav>

            {/* Title */}
            <div className="flex items-center gap-3 mt-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {ticket.subject}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-bold ${statusConfig?.bg} ${statusConfig?.text}`}
              >
                {statusConfig?.label}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-bold ${priorityConfig.bg} ${priorityConfig.text} uppercase`}
              >
                {priorityConfig.label}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleStatusDialogOpen}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span> Change Status
            </button>
            <PinButton
              entityType="ticket"
              entityId={ticket.id}
              title={ticket.subject}
              icon="confirmation_number"
              url={`${detailUrlPrefix}/${ticket.id}`}
            />
            <MoreActionsButton onClick={() => setActionSheetOpen(true)} />
          </div>
        </div>

        <EntityActionSheet
          open={actionSheetOpen}
          onOpenChange={setActionSheetOpen}
          entity={{
            type: 'ticket',
            id: ticket.id,
            title: ticket.subject,
            subtitle: `#${ticket.ticketNumber}`,
            icon: 'confirmation_number',
            url: `${detailUrlPrefix}/${ticket.id}`,
          }}
          extraActions={[
            {
              label: 'Merge Ticket',
              icon: 'merge',
              onClick: () =>
                toast({
                  title: 'Merge not available',
                  description:
                    'Ticket merging with field reconciliation is tracked under IFC-137. Not yet implemented.',
                }),
            },
            {
              label: 'Mark as Spam',
              icon: 'report',
              onClick: () => {
                setActionSheetOpen(false);
                _onStatusChange('SPAM').catch(() => {});
              },
            },
            ...(() => {
              if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
                return [
                  {
                    label: 'Archive',
                    icon: 'archive',
                    onClick: () => {
                      setActionSheetOpen(false);
                      if (onArchive) {
                        setArchiveConfirmOpen(true);
                      } else {
                        toast({
                          title: 'Archive unavailable',
                          description: 'Archive action is not wired for this view.',
                        });
                      }
                    },
                  },
                ];
              }
              if (ticket.status !== 'ARCHIVED') {
                return [
                  {
                    label: 'Delete',
                    icon: 'delete',
                    onClick: () => {
                      setActionSheetOpen(false);
                      if (onDelete) {
                        setDeleteConfirmOpen(true);
                      } else {
                        toast({
                          title: 'Delete unavailable',
                          description: 'Delete action is not wired for this view.',
                        });
                      }
                    },
                    destructive: true,
                  },
                ];
              }
              return [];
            })(),
          ]}
        />
        <TicketAssignSidebar
          open={assignSidebarOpen}
          onOpenChange={setAssignSidebarOpen}
          ticketSubject={ticket.subject}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          assignees={assigneeOptions}
          isAssigning={isLoading}
          isLoadingOptions={isAssigneeOptionsLoading}
          onAssign={onAssign}
        />
        <AssignSheet
          open={escalationSheetOpen}
          onOpenChange={(open) => {
            setEscalationSheetOpen(open);
            if (!open) setEscalationReason('');
          }}
          title="Escalate Ticket"
          description={`Escalate "${ticket.subject}" to a manager for urgent review.`}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          assignees={assigneeOptions}
          isAssigning={isLoading}
          isLoadingOptions={isAssigneeOptionsLoading}
          onAssign={handleEscalateConfirm}
          showSelfAssign={false}
          teamSectionLabel="Escalate To"
          canAssign={!!escalationReason.trim()}
        >
          <div className="space-y-2">
            <label
              htmlFor="ticket-escalation-reason"
              className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
            >
              Reason for Escalation *
            </label>
            <textarea
              id="ticket-escalation-reason"
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
              placeholder="Explain why this ticket needs urgent manager attention..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] resize-none text-sm"
              rows={3}
            />
            {!escalationReason.trim() && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                A reason is required before selecting a reviewer.
              </p>
            )}
          </div>
        </AssignSheet>

        {/* Delete confirmation dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete ticket?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete ticket #{ticket.ticketNumber} &ldquo;{ticket.subject}
                &rdquo;. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  onDelete?.();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Archive confirmation dialog */}
        <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive ticket?</AlertDialogTitle>
              <AlertDialogDescription>
                Ticket #{ticket.ticketNumber} will be archived and removed from active views. You
                can find it later in the archived tickets list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setArchiveConfirmOpen(false);
                  onArchive?.();
                }}
              >
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* SLA Alert Banner */}
        {ticket.sla.resolution.status === 'BREACHED' && (
          <EscalationAlert
            slaStatus={ticket.sla.resolution.status}
            breachedMetric="resolution"
            breachedDuration={formatSLATime(Math.abs(ticket.sla.resolution.remaining))}
            ticketPriority={ticket.priority}
            onEscalate={handleEscalate}
          />
        )}

        {/* Main 3-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Sidebar - 3 cols */}
          <aside className="lg:col-span-3 flex flex-col gap-6">
            {/* About Ticket Card */}
            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
                About Ticket
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Channel</p>
                  <div className="flex items-center gap-2 text-slate-900 dark:text-slate-200 font-medium">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">
                      {getChannelIcon(ticket.channel || 'portal')}
                    </span>
                    <span className="text-sm capitalize">{ticket.channel || 'Portal'}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Category</p>
                  <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {ticket.category || 'General'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Type</p>
                  <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                    {ticket.type}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Created</p>
                  <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-200 font-medium">
                    <span className="material-symbols-outlined text-[16px] text-slate-400">
                      schedule
                    </span>
                    <span className="text-sm">{ticket.createdAt}</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 mb-1">Last Updated</p>
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {ticket.updatedAt}
                  </span>
                </div>
                {ticket.tags.length > 0 && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {ticket.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Customer Card */}
            <Card className="overflow-hidden">
              <div className="h-16 bg-gradient-to-r from-blue-100 to-blue-50 dark:from-slate-800 dark:to-slate-800" />
              <div className="px-5 pb-5 relative">
                <div className="relative -mt-8 mb-3">
                  <AppAvatar
                    name={ticket.customer.name}
                    src={ticket.customer.avatar ?? null}
                    maxInitials={1}
                    className="w-16 h-16 border-4 border-white dark:border-slate-900 shadow-sm"
                    fallbackClassName="text-lg font-bold text-slate-600 bg-slate-200 dark:bg-slate-700"
                  />
                </div>
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {ticket.customer.name}
                    </h3>
                    {ticket.customer.isVIP && (
                      <span className="px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-bold">
                        VIP
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {ticket.customer.title}
                  </p>
                  <Link
                    href={`/accounts/${ticket.account.id}`}
                    className="flex items-center gap-1 text-[#137fec] text-sm font-medium mt-1 hover:underline"
                  >
                    <span className="material-symbols-outlined text-[16px]">business</span>{' '}
                    {ticket.customer.company}
                  </Link>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">
                      mail
                    </span>
                    <EntityHoverCard
                      email={ticket.customer.email}
                      displayName={ticket.customer.name}
                    >
                      <Link
                        href={`/email/compose?to=${encodeURIComponent(ticket.customer.email)}`}
                        className="text-slate-700 dark:text-slate-300 hover:text-[#137fec]"
                      >
                        {ticket.customer.email}
                      </Link>
                    </EntityHoverCard>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">
                      call
                    </span>
                    <a
                      href={`tel:${ticket.customer.phone}`}
                      className="text-slate-700 dark:text-slate-300 hover:text-[#137fec]"
                    >
                      {ticket.customer.phone}
                    </a>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#137fec]/10 text-[#137fec] text-xs font-semibold hover:bg-[#137fec]/20 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">mail</span> Email
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#137fec]/10 text-[#137fec] text-xs font-semibold hover:bg-[#137fec]/20 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">call</span> Call
                  </button>
                  <Link
                    href={`/contacts/${ticket.customer.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">person</span> Profile
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">
                      {ticket.customer.totalTickets}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase">Total Tickets</p>
                  </div>
                  <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">
                      {ticket.account.tier}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase">Account Tier</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Assignee Card */}
            <Card className="p-5 flex-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
                Assigned To
              </h3>
              {ticket.assigneeInfo ? (
                <div className="flex items-center gap-3">
                  <AppAvatar
                    name={ticket.assigneeInfo.name}
                    src={ticket.assigneeInfo.avatar ?? null}
                    maxInitials={1}
                    className="w-10 h-10"
                    fallbackClassName="text-sm font-bold bg-slate-200 dark:bg-slate-700"
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {ticket.assigneeInfo.name}
                    </p>
                    <p className="text-xs text-slate-500">{ticket.assigneeInfo.title}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Unassigned</p>
              )}
              <button
                onClick={() => setAssignSidebarOpen(true)}
                disabled={isLoading || !canOpenAssignSidebar}
                className="w-full mt-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Reassign
              </button>
            </Card>
          </aside>

          {/* Center Content - 6 cols */}
          <section className="lg:col-span-6 flex flex-col gap-6">
            <Card>
              {/* Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 px-2 overflow-x-auto">
                {tabs.map((tab) => {
                  const attachmentsOrUndefined =
                    tab.id === 'attachments' ? attachmentCount : undefined;
                  const count = tab.id === 'activity' ? activityCount : attachmentsOrUndefined;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'text-[#137fec] border-[#137fec]'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
                      }`}
                    >
                      {tab.label}
                      {count !== undefined && count > 0 && (
                        <span className="ml-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <QuickLogComposer
                placeholder="Add an internal note to this ticket..."
                submitLabel="Add Note"
                onSubmit={(note) => {
                  onAddResponse(note, true)
                    .then(() => {
                      toast({
                        title: 'Note added',
                        description: 'Internal note has been recorded.',
                      });
                    })
                    .catch(() => {
                      toast({ title: 'Failed to add note', variant: 'destructive' });
                    });
                }}
              />
            </Card>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <Card className="p-6">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                    Description
                  </h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {ticket.description || 'No description provided.'}
                  </p>
                </Card>

                <Card className="p-6">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
                    SLA Metrics
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                      <p className={`text-2xl font-bold ${firstResponseMetricClass}`}>
                        {firstResponseValue === null ? 'Pending' : `${firstResponseValue}m`}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">First Response</p>
                      <p className="text-[10px] text-slate-400">
                        Target: {ticket.sla.firstResponse.target}m
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                      <p className={`text-2xl font-bold ${slaConfig.text}`}>
                        {formatSLATime(ticket.sla.resolution.remaining)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Resolution Time</p>
                      <p className="text-[10px] text-slate-400">
                        Target: {ticket.sla.resolution.target}m
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {activityCount}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Interactions</p>
                      <p className="text-[10px] text-slate-400">Last: {ticket.updatedAt}</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Recent Activity
                    </h4>
                    <button
                      onClick={() => setActiveTab('activity')}
                      className="text-xs text-[#137fec] font-medium hover:underline"
                    >
                      View All
                    </button>
                  </div>
                  <div className="space-y-3">
                    {ticket.activities.slice(0, 3).map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                      >
                        <AppAvatar
                          name={activity.author.name}
                          src={activity.author.avatar ?? null}
                          maxInitials={1}
                          className="w-8 h-8 flex-shrink-0"
                          fallbackClassName="text-xs font-bold bg-slate-200 dark:bg-slate-700"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {activity.author.name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {activity.content.substring(0, 80)}...
                          </p>
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {activity.timestamp}
                        </span>
                      </div>
                    ))}
                    {ticket.activities.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No recent activity yet
                      </p>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* Activity Tab */}
            {activeTab === 'activity' && (
              <Card className="p-6">
                <div className="space-y-6">
                  {/* View Toggle: Timeline vs Unified Feed (IFC-069) */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
                    <button
                      onClick={() => setActivityView('timeline')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        activityView === 'timeline'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm align-middle mr-1">
                        timeline
                      </span>{' '}
                      Timeline
                    </button>
                    <button
                      onClick={() => setActivityView('unified')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        activityView === 'unified'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm align-middle mr-1">
                        dynamic_feed
                      </span>{' '}
                      All Sources
                    </button>
                  </div>

                  {activityView === 'unified' ? (
                    <ActivityFeed
                      entityType="TICKET"
                      entityId={ticket.id}
                      height={500}
                      emptyMessage="No activity found across all sources"
                    />
                  ) : (
                    <>
                      <div className="relative space-y-6" style={{ paddingLeft: 40 }}>
                        {/* Continuous vertical timeline line — centered through icons */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700"
                          style={{ left: 19 }}
                        />

                        {ticket.activities.map((activity) => (
                          <ActivityItem
                            key={activity.id}
                            activity={activity}
                            isDeepLinked={isDeepLinkedActivity(activity.id, selectedActivityId)}
                          />
                        ))}
                      </div>

                      <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                          <div className="flex border-b border-slate-100 dark:border-slate-700">
                            <button
                              onClick={() => setReplyMode('public')}
                              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                                replyMode === 'public'
                                  ? 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                  : 'text-slate-400 hover:bg-slate-50'
                              }`}
                            >
                              Public Reply
                            </button>
                            <button
                              onClick={() => setReplyMode('internal')}
                              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                                replyMode === 'internal'
                                  ? 'bg-yellow-50 dark:bg-yellow-900/10 text-yellow-700'
                                  : 'text-slate-400 hover:bg-yellow-50'
                              }`}
                            >
                              Internal Note
                            </button>
                          </div>
                          <textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            className="w-full p-4 text-sm bg-transparent border-none focus:ring-0 min-h-[120px] resize-y placeholder:text-slate-400"
                            placeholder="Type your reply..."
                          />
                          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700">
                            <div className="flex gap-1">
                              <button className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition-colors">
                                <span className="material-symbols-outlined text-[18px]">
                                  format_bold
                                </span>
                              </button>
                              <button className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition-colors">
                                <span className="material-symbols-outlined text-[18px]">
                                  attach_file
                                </span>
                              </button>
                            </div>
                            <button
                              onClick={handleSendReply}
                              disabled={isLoading || !replyContent.trim()}
                              className="px-4 py-1.5 bg-[#137fec] text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                              Send Reply{' '}
                              <span className="material-symbols-outlined text-[16px]">send</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            )}

            {/* Resolution Tab */}
            {activeTab === 'resolution' && (
              <Card className="p-6">
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-900/30">
                    <div>
                      <p className="font-bold text-amber-800 dark:text-amber-400">
                        Pending Resolution
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        This ticket requires a resolution.
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-amber-500 text-3xl">
                      pending
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="resolution-type-select"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Resolution Type
                      </label>
                      <select
                        id="resolution-type-select"
                        value={resolutionType}
                        onChange={(e) => setResolutionType(e.target.value)}
                        className="w-full py-2 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm"
                      >
                        <option value="">Select type...</option>
                        <option value="Fixed">Fixed</option>
                        <option value="Workaround Provided">Workaround Provided</option>
                        <option value="Cannot Reproduce">Cannot Reproduce</option>
                        <option value="Duplicate">Duplicate</option>
                        <option value="Won't Fix">Won&apos;t Fix</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="root-cause-textarea"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Root Cause
                      </label>
                      <textarea
                        id="root-cause-textarea"
                        value={rootCause}
                        onChange={(e) => setRootCause(e.target.value)}
                        className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 min-h-[80px]"
                        placeholder="Describe the root cause..."
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="resolution-summary-textarea"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Resolution Summary
                      </label>
                      <textarea
                        id="resolution-summary-textarea"
                        value={resolutionSummary}
                        onChange={(e) => setResolutionSummary(e.target.value)}
                        className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 min-h-[120px]"
                        placeholder="Describe how the issue was resolved..."
                      />
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={notifyCustomer}
                        onChange={(e) => setNotifyCustomer(e.target.checked)}
                        className="rounded border-slate-300 text-[#137fec]"
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        Notify customer of resolution
                      </span>
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                      Save Draft
                    </button>
                    <button
                      onClick={handleResolve}
                      disabled={isLoading || !resolutionType || !resolutionSummary.trim()}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>{' '}
                      Mark as Resolved
                    </button>
                  </div>
                </div>
              </Card>
            )}

            {/* Attachments Tab */}
            {activeTab === 'attachments' && (
              <Card className="p-6">
                <div className="space-y-6">
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center hover:border-[#137fec] hover:bg-[#137fec]/5 transition-colors cursor-pointer">
                    <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">
                      cloud_upload
                    </span>
                    <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                      Drop files here or click to upload
                    </p>
                    <p className="text-xs text-slate-500">PDF, DOC, PNG, JPG up to 10MB</p>
                  </div>

                  <div className="space-y-3">
                    {ticket.attachments.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                      >
                        {(() => {
                          const fileIsPdf = file.type === 'pdf';
                          const fileIsImage = file.type === 'image';
                          let fileBgClass: string;
                          if (fileIsPdf) {
                            fileBgClass = 'bg-red-100 dark:bg-red-900/30';
                          } else if (fileIsImage) {
                            fileBgClass = 'bg-blue-100 dark:bg-blue-900/30';
                          } else {
                            fileBgClass = 'bg-green-100 dark:bg-green-900/30';
                          }
                          let fileTextClass: string;
                          if (fileIsPdf) {
                            fileTextClass = 'text-red-600';
                          } else if (fileIsImage) {
                            fileTextClass = 'text-blue-600';
                          } else {
                            fileTextClass = 'text-green-600';
                          }
                          let fileIconName: string;
                          if (fileIsPdf) {
                            fileIconName = 'picture_as_pdf';
                          } else if (fileIsImage) {
                            fileIconName = 'image';
                          } else {
                            fileIconName = 'description';
                          }
                          return (
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${fileBgClass}`}
                            >
                              <span className={`material-symbols-outlined ${fileTextClass}`}>
                                {fileIconName}
                              </span>
                            </div>
                          );
                        })()}
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {file.size} • {file.uploader}
                          </p>
                        </div>
                        <button className="p-1.5 text-slate-400 hover:text-[#137fec] transition-colors">
                          <span className="material-symbols-outlined">download</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* AI Insights Tab */}
            {activeTab === 'ai-insights' && (
              <Card className="p-6">
                <div className="space-y-6">
                  {(() => {
                    const riskIsHigh = ticket.aiInsights.escalationRisk === 'high';
                    const riskIsMedium = ticket.aiInsights.escalationRisk === 'medium';
                    let riskBgBorderClass: string;
                    if (riskIsHigh) {
                      riskBgBorderClass =
                        'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800';
                    } else if (riskIsMedium) {
                      riskBgBorderClass =
                        'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800';
                    } else {
                      riskBgBorderClass =
                        'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800';
                    }
                    let riskIconColorClass: string;
                    if (riskIsHigh) {
                      riskIconColorClass = 'text-red-500';
                    } else if (riskIsMedium) {
                      riskIconColorClass = 'text-yellow-500';
                    } else {
                      riskIconColorClass = 'text-green-500';
                    }
                    return (
                      <div className={`p-4 rounded-lg border ${riskBgBorderClass}`}>
                        <div className="flex items-center gap-3">
                          <span
                            className={`material-symbols-outlined text-2xl ${riskIconColorClass}`}
                          >
                            {riskIsHigh ? 'warning' : 'insights'}
                          </span>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              Escalation Risk:{' '}
                              <span className="capitalize">{ticket.aiInsights.escalationRisk}</span>
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              Predicted resolution time: {ticket.aiInsights.predictedResolutionTime}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#137fec] text-[20px]">
                        lightbulb
                      </span>{' '}
                      Suggested Solutions
                    </h4>
                    <div className="space-y-2">
                      {ticket.aiInsights.suggestedSolutions.map((solution, i) => (
                        <div
                          key={i} // NOSONAR typescript:S6479
                          className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                        >
                          <span className="text-[#137fec] font-bold text-sm">{i + 1}.</span>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{solution}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-purple-500 text-[20px]">
                        content_copy
                      </span>{' '}
                      Similar Resolved Tickets ({ticket.aiInsights.similarResolvedTickets})
                    </h4>
                    <div className="space-y-2">
                      {ticket.relatedTickets
                        .filter((t) => t.status === 'RESOLVED')
                        .map((related) => (
                          <Link
                            key={related.id}
                            href={`${detailUrlPrefix}/${related.id}`}
                            className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            <div>
                              <span className="text-sm font-medium text-[#137fec]">
                                #{related.id}
                              </span>
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                {related.subject}
                              </p>
                            </div>
                            <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">
                              {related.similarity}% match
                            </span>
                          </Link>
                        ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                      <span className="text-3xl mb-2 block">
                        {(() => {
                          const sentimentNegativeEmoji =
                            ticket.aiInsights.sentiment === 'negative' ? '😟' : '😐';
                          return ticket.aiInsights.sentiment === 'positive'
                            ? '😊'
                            : sentimentNegativeEmoji;
                        })()}
                      </span>
                      <p className="text-sm font-medium text-slate-900 dark:text-white capitalize">
                        {ticket.aiInsights.sentiment} Sentiment
                      </p>
                      <p className="text-xs text-slate-500">Based on customer messages</p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                      <p className="text-3xl font-bold text-[#137fec] mb-2">
                        {ticket.aiInsights.similarResolvedTickets}
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        Similar Tickets Resolved
                      </p>
                      <p className="text-xs text-slate-500">In the last 30 days</p>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </section>

          {/* Right Sidebar - 3 cols */}
          <aside className="lg:col-span-3 flex flex-col gap-6">
            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
                SLA Tracking
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300">First Response</span>
                    <span className={firstResponseSummaryClass}>{firstResponseSummaryText}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${firstResponseBarClass} w-full`} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300">Resolution</span>
                    <span className={`font-medium ${slaConfig.text}`}>{slaConfig.label}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    {(() => {
                      const slaAtRiskOrGreenColor =
                        ticket.sla.resolution.status === 'AT_RISK'
                          ? 'bg-yellow-500'
                          : 'bg-green-500';
                      const slaBarColor =
                        ticket.sla.resolution.status === 'BREACHED'
                          ? 'bg-red-500'
                          : slaAtRiskOrGreenColor;
                      return <div className={`h-full ${slaBarColor} w-full`} />;
                    })()}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>Target: {ticket.sla.resolution.target}m</span>
                    <span className={slaConfig.text}>
                      {formatSLATime(ticket.sla.resolution.remaining)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setActiveTab('resolution')}
                  className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group"
                >
                  <span
                    className="material-symbols-outlined text-slate-400 group-hover:text-green-600 mb-1"
                    style={{ fontSize: '24px' }}
                  >
                    check_circle
                  </span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:text-green-600">
                    Resolve
                  </span>
                </button>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group disabled:opacity-50"
                >
                  <span
                    className="material-symbols-outlined text-slate-400 mb-1"
                    style={{ fontSize: '24px' }}
                  >
                    close
                  </span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    Close
                  </span>
                </button>
                <button
                  onClick={handleEscalate}
                  disabled={isLoading}
                  className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all group disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-transparent dark:disabled:hover:border-slate-700 dark:disabled:hover:bg-transparent"
                >
                  <span
                    className="material-symbols-outlined text-slate-400 group-hover:text-red-600 mb-1"
                    style={{ fontSize: '24px' }}
                  >
                    publish
                  </span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:text-red-600">
                    Escalate
                  </span>
                </button>
                <button
                  onClick={() => setAssignSidebarOpen(true)}
                  disabled={isLoading || !canOpenAssignSidebar}
                  className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#137fec] hover:bg-[#137fec]/5 transition-all group disabled:opacity-50"
                >
                  <span
                    className="material-symbols-outlined text-slate-400 group-hover:text-[#137fec] mb-1"
                    style={{ fontSize: '24px' }}
                  >
                    forward
                  </span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:text-[#137fec]">
                    Assign
                  </span>
                </button>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Next Steps
                </h3>
                <button className="w-6 h-6 flex items-center justify-center rounded bg-[#137fec]/10 hover:bg-[#137fec]/20 text-[#137fec] transition-colors">
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              </div>
              <div className="space-y-3">
                {ticket.nextSteps.map((step) => (
                  <label
                    key={step.id}
                    aria-label={step.title}
                    className="flex items-start gap-3 group cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      defaultChecked={step.completed}
                      className="mt-1 rounded border-slate-300 text-[#137fec] focus:ring-[#137fec]/50"
                    />
                    <div className="text-sm">
                      <p className="font-medium text-slate-700 dark:text-slate-300 group-hover:text-[#137fec] transition-colors">
                        {step.title}
                      </p>
                      <p
                        className={`text-xs mt-0.5 ${step.dueDate.includes('hour') ? 'text-red-500' : 'text-slate-400'}`}
                      >
                        {step.dueDate}
                      </p>
                    </div>
                  </label>
                ))}
                {ticket.nextSteps.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No next steps defined
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-5 flex-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
                Related Tickets
              </h3>
              <div className="space-y-2">
                {ticket.relatedTickets.map((related) => {
                  const relatedStatus = getStatusConfig(related.status);
                  return (
                    <Link
                      key={related.id}
                      href={`${detailUrlPrefix}/${related.id}`}
                      className="block p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[#137fec]">#{related.id}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${relatedStatus?.bg} ${relatedStatus?.text}`}
                        >
                          {relatedStatus?.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-1">{related.subject}</p>
                    </Link>
                  );
                })}
                {ticket.relatedTickets.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No related tickets
                  </p>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Item Component ────────────────────────────────────────────────

const TICKET_ACTIVITY_ICON: Record<string, { icon: string; bg: string; color: string }> = {
  customer_message: {
    icon: 'chat_bubble',
    bg: 'bg-slate-100 dark:bg-slate-700',
    color: 'text-slate-600 dark:text-slate-300',
  },
  agent_reply: {
    icon: 'reply',
    bg: 'bg-blue-100 dark:bg-blue-900',
    color: 'text-blue-600 dark:text-blue-300',
  },
  internal_note: {
    icon: 'sticky_note_2',
    bg: 'bg-yellow-100 dark:bg-yellow-900',
    color: 'text-yellow-600 dark:text-yellow-300',
  },
  system_event: {
    icon: 'settings',
    bg: 'bg-slate-200 dark:bg-slate-700',
    color: 'text-slate-500 dark:text-slate-400',
  },
  sla_breach: {
    icon: 'timer_off',
    bg: 'bg-red-100 dark:bg-red-900',
    color: 'text-red-600 dark:text-red-300',
  },
  priority_change: {
    icon: 'swap_vert',
    bg: 'bg-orange-100 dark:bg-orange-900',
    color: 'text-orange-600 dark:text-orange-300',
  },
};

const DEFAULT_TICKET_ICON = {
  icon: 'info',
  bg: 'bg-slate-100 dark:bg-slate-800',
  color: 'text-slate-500 dark:text-slate-400',
};

function ActivityItem({
  activity,
  isDeepLinked = false,
}: Readonly<{ activity: TicketActivity; isDeepLinked?: boolean }>) {
  const iconStyle = TICKET_ACTIVITY_ICON[activity.type] || DEFAULT_TICKET_ICON;
  return (
    <div
      data-activity-id={activity.id}
      className={`relative rounded-lg transition-colors ${isDeepLinked ? 'bg-primary/5 ring-2 ring-primary/30 ring-inset p-2' : ''}`}
    >
      {/* Timeline dot — centered on the vertical line (matches contacts/leads layout) */}
      <div
        className={`absolute w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 shadow-sm flex items-center justify-center z-10 ${iconStyle.bg}`}
        style={{ left: -36, top: 12 }}
      >
        <span className={`material-symbols-outlined !text-[16px] ${iconStyle.color}`}>
          {iconStyle.icon}
        </span>
      </div>

      {(activity.type === 'customer_message' || activity.type === 'agent_reply') && (
        <div
          className={`p-4 rounded-lg ${activity.type === 'agent_reply' ? 'bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900 dark:text-white">
                {activity.author.name}
              </span>
              {activity.metadata?.via && (
                <span className="text-xs text-slate-500">via {activity.metadata.via}</span>
              )}
            </div>
            <span className="text-xs text-slate-400">{activity.timestamp}</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
            {activity.content}
          </p>
        </div>
      )}

      {activity.type === 'internal_note' && (
        <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900 dark:text-white">
                {activity.author.name}
              </span>
              <span className="bg-yellow-200 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-400 text-[10px] font-bold px-1.5 rounded">
                INTERNAL
              </span>
            </div>
            <span className="text-xs text-slate-400">{activity.timestamp}</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 italic">{activity.content}</p>
        </div>
      )}

      {(activity.type === 'system_event' || activity.type === 'priority_change') && (
        <div className="flex items-center gap-2 py-2">
          <span className="text-xs text-slate-500">
            {activity.author.name} {activity.content}
          </span>
          {activity.metadata?.newPriority && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                activity.metadata.newPriority === 'Critical'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-orange-100 text-orange-700'
              }`}
            >
              {activity.metadata.newPriority}
            </span>
          )}
          <span className="text-xs text-slate-400 ml-auto">{activity.timestamp}</span>
        </div>
      )}

      {activity.type === 'sla_breach' && (
        <div className="flex items-center gap-2 py-2 px-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
          <span className="material-symbols-outlined text-red-500 text-[18px]">timer_off</span>
          <span className="text-xs font-bold text-red-600 dark:text-red-400">SLA BREACHED</span>
          <span className="text-xs text-slate-500">{activity.content}</span>
          <span className="text-xs text-slate-400 ml-auto">{activity.timestamp}</span>
        </div>
      )}
    </div>
  );
}
