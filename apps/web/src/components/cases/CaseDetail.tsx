'use client';

/**
 * CaseDetail Component (PG-138)
 *
 * Matches the case-detail.html design mockup:
 * - Breadcrumb + title + Export/New Entry buttons
 * - 3-column grid: left profile, center tabs+timeline, right metrics
 * - Left: Priority badge, case number, client, status pulse, team avatars, tags
 * - Center: Tabs (Overview, Activities, Evidence, Records) with activity logger + timeline
 * - Right: Case Health bars, Deadlines calendar, Key Stakeholders with avatars
 */

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Skeleton, cn, EmptyState } from '@intelliflow/ui';
import {
  getStatusConfig,
  getPriorityConfig,
  formatDeadlineShort,
  getInitials,
  timeAgo,
} from '@/lib/cases/case-utils';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { DeadlineTracker } from './DeadlineTracker';
import { PartyManager } from './PartyManager';
import { DocumentLinks } from './DocumentLinks';
import type { CaseDetailData, CaseAssigneeOption, PartyData, TimelineEntry } from './types';
import type { AddCaseTaskInput } from '@intelliflow/validators/case';

// ─── Types ──────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'activities' | 'evidence' | 'records';

interface CaseDetailProps {
  caseData: CaseDetailData;
  isLoading: boolean;
  assigneeOptions: CaseAssigneeOption[];
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onAssign: (userId: string) => void;
  onClose: (resolution: string) => void;
  onAddTask: (task: Omit<AddCaseTaskInput, 'caseId'>) => void;
  onCompleteTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onUpdateParties: (parties: PartyData[]) => void;
  onLogActivity?: (content: string) => void;
}

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activities', label: 'Activities' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'records', label: 'Records' },
];

// ─── Timeline Icon ──────────────────────────────────────────────────────────

function TimelineIcon({ type }: Readonly<{ type: TimelineEntry['type'] }>) {
  const config: Record<string, { bg: string; text: string; icon: string }> = {
    meeting: { bg: 'bg-blue-100', text: 'text-primary', icon: 'schedule' },
    document: { bg: 'bg-green-100', text: 'text-green-600', icon: 'check_circle' },
    status_change: { bg: 'bg-blue-100', text: 'text-primary', icon: 'history' },
    note: { bg: 'bg-amber-100', text: 'text-amber-600', icon: 'edit_note' },
    event: { bg: 'bg-blue-100', text: 'text-primary', icon: 'event' },
  };
  const c = config[type] || config.note;
  return (
    <div
      className={cn(
        'size-10 rounded-full border-4 border-white flex items-center justify-center z-10 shrink-0',
        c.bg,
        c.text
      )}
    >
      <span className="material-symbols-outlined text-sm">{c.icon}</span>
    </div>
  );
}

// ─── Avatar helpers ─────────────────────────────────────────────────────────

function Avatar({ name, url, size = 'sm' }: Readonly<{ name: string; url?: string; size?: 'sm' | 'md' }>) {
  const sizeClass = size === 'md' ? 'size-8' : 'size-5';
  const textSize = size === 'md' ? 'text-[10px]' : 'text-[8px]';
  if (url) {
    return (
      <Image
        src={url}
        alt={name}
        width={size === 'md' ? 32 : 20}
        height={size === 'md' ? 32 : 20}
        className={cn(sizeClass, 'rounded-full object-cover')}
        unoptimized
      />
    );
  }
  return (
    <div
      className={cn(
        sizeClass,
        'rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground',
        textSize
      )}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CaseDetail({
  caseData,
  isLoading,
  assigneeOptions: _assigneeOptions,
  onStatusChange: _onStatusChange,
  onPriorityChange: _onPriorityChange,
  onAssign: _onAssign,
  onClose,
  onAddTask,
  onCompleteTask,
  onRemoveTask,
  onUpdateParties,
  onLogActivity,
}: Readonly<CaseDetailProps>) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [activityText, setActivityText] = useState('');
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [resolution, setResolution] = useState('');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-64 mb-2" />
        <Skeleton className="h-8 w-96" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-3 space-y-4">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <div className="xl:col-span-6">
            <Skeleton className="h-96 rounded-xl" />
          </div>
          <div className="xl:col-span-3 space-y-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <p className="text-muted-foreground">Case not found</p>
      </div>
    );
  }

  const statusCfg = getStatusConfig(caseData.status);
  const priorityCfg = getPriorityConfig(caseData.priority);
  const isClosed = caseData.status === 'CLOSED' || caseData.status === 'CANCELLED';
  const caseNumber = caseData.caseNumber || `#${caseData.id.slice(0, 8).toUpperCase()}`;
  const resolutionProgress = caseData.resolutionProgress ?? caseData.taskProgress ?? 0;
  const budgetConsumed = caseData.budgetConsumed ?? 0;
  const slaDays = caseData.slaDays ?? 0;
  const openItems = caseData.openItems ?? caseData.pendingTaskCount ?? 0;
  const timeline = caseData.timeline ?? [];
  const rawParties = caseData.parties;
  let parsedParties: PartyData[];
  if (Array.isArray(rawParties)) {
    parsedParties = rawParties;
  } else if (typeof rawParties === 'string') {
    try {
      parsedParties = JSON.parse(rawParties);
    } catch {
      parsedParties = [];
    }
  } else {
    parsedParties = [];
  }
  // Ensure every party has a stable unique id (DB-stored JSON may omit it)
  const parties: PartyData[] = parsedParties.map((p, i) => ({
    ...p,
    id: p.id || `party-${i}-${p.name}-${p.role}`,
  }));
  const tags = caseData.tags ?? [];

  const handleClose = () => {
    if (resolution.trim()) {
      onClose(resolution);
      setShowCloseDialog(false);
      setResolution('');
    }
  };

  const handleLogActivity = () => {
    if (activityText.trim() && onLogActivity) {
      onLogActivity(activityText.trim());
      setActivityText('');
    }
  };

  return (
    <div>
      {/* ── Breadcrumb & Actions ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/" className="hover:text-primary">
              Main Dashboard
            </Link>
            <span className="material-symbols-outlined text-[12px]">chevron_right</span>
            <Link href="/cases" className="hover:text-primary">
              Cases
            </Link>
            <span className="material-symbols-outlined text-[12px]">chevron_right</span>
            <span className="text-primary font-medium">{caseNumber}</span>
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">{caseData.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-bold text-foreground hover:bg-muted transition-colors">
            <span className="material-symbols-outlined">ios_share</span>{' '}Export
          </button>
          {!isClosed && (
            <button
              onClick={() => setShowCloseDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
            >
              <span className="material-symbols-outlined">add</span>{' '}New Entry
            </button>
          )}
        </div>
      </div>

      {/* ── Three Column Grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ── Left Column: Profile ── */}
        <div className="xl:col-span-3 space-y-6">
          {/* Case info card */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <span
                className={cn(
                  'px-2 py-1 text-[10px] font-bold rounded uppercase tracking-wider',
                  priorityCfg.bgColor,
                  priorityCfg.color
                )}
              >
                {priorityCfg.label} Priority
              </span>
              <button className="text-muted-foreground hover:text-foreground">
                <span className="material-symbols-outlined">more_vert</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                  Case Number
                </span>
                <p className="text-sm font-bold text-foreground">{caseNumber}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                  Client
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <div className="size-6 bg-muted rounded flex items-center justify-center">
                    <span className="material-symbols-outlined text-muted-foreground text-sm">
                      business
                    </span>
                  </div>
                  <Link
                    href={`/accounts/${caseData.client.id}`}
                    className="text-sm font-semibold text-foreground hover:text-primary"
                  >
                    {caseData.client.name}
                  </Link>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                  Status
                </span>
                {isClosed ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full',
                      statusCfg.bgColor,
                      statusCfg.color
                    )}
                  >
                    {statusCfg.label}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full">
                    <span className="size-2 bg-primary rounded-full animate-pulse" />
                    {statusCfg.label}
                  </span>
                )}
              </div>

              {/* Assigned Team */}
              <div className="pt-4 border-t border-border/50">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-3">
                  Assigned Team
                </span>
                {caseData.assignedTeam && caseData.assignedTeam.length > 0 ? (
                  <>
                    <div className="flex -space-x-2">
                      {caseData.assignedTeam.slice(0, 3).map((m) => (
                        <Avatar key={m.id} name={m.name} url={m.avatarUrl} size="md" />
                      ))}
                      {caseData.assignedTeam.length > 3 && (
                        <div className="size-8 rounded-full border-2 border-white bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                          +{caseData.assignedTeam.length - 3}
                        </div>
                      )}
                    </div>
                    {caseData.managedBy && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        Managed by {caseData.managedBy}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={caseData.assignee.name}
                      url={caseData.assignee.avatarUrl ?? undefined}
                      size="md"
                    />
                    <span className="text-sm text-foreground">{caseData.assignee.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tags card */}
          {tags.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <h3 className="text-sm font-bold text-foreground mb-4">Case Tags</h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-muted text-muted-foreground text-[10px] font-medium rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Center Column: Tabs & Content ── */}
        <div className="xl:col-span-6 space-y-6">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-border/50 px-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-4 py-4 text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'text-primary font-bold border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* ── Overview Tab ── */}
              {activeTab === 'overview' && (
                <div>
                  {/* Activity Logger */}
                  <div className="bg-muted rounded-lg p-4 mb-8">
                    <textarea
                      value={activityText}
                      onChange={(e) => setActivityText(e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none placeholder:text-muted-foreground outline-none"
                      placeholder="Write a note or log an activity..."
                      rows={3}
                      aria-label="Activity note"
                    />
                    <div className="flex items-center justify-between mt-2 pt-3 border-t border-border/50">
                      <div className="flex gap-2">
                        <button
                          className="p-1.5 text-muted-foreground hover:bg-muted/50 rounded transition-colors"
                          aria-label="Attach file"
                        >
                          <span className="material-symbols-outlined">attach_file</span>
                        </button>
                        <button
                          className="p-1.5 text-muted-foreground hover:bg-muted/50 rounded transition-colors"
                          aria-label="Mention"
                        >
                          <span className="material-symbols-outlined">alternate_email</span>
                        </button>
                        <button
                          className="p-1.5 text-muted-foreground hover:bg-muted/50 rounded transition-colors"
                          aria-label="Add image"
                        >
                          <span className="material-symbols-outlined">image</span>
                        </button>
                      </div>
                      <button
                        onClick={handleLogActivity}
                        className="px-4 py-1.5 bg-primary text-white text-xs font-bold rounded-lg shadow-sm hover:bg-primary/90 transition-colors"
                      >
                        Log Activity
                      </button>
                    </div>
                  </div>

                  {/* Chronological Timeline */}
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-6">
                    Chronological Timeline
                  </h4>

                  {timeline.length > 0 ? (
                    <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:bg-muted">
                      {timeline.map((entry) => (
                        <div key={entry.id} className="relative flex items-start gap-6 group">
                          <TimelineIcon type={entry.type} />
                          <div className="flex-1 bg-card rounded-lg border border-border/50 p-4 shadow-sm group-hover:border-primary/30 transition-colors">
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-sm font-bold text-foreground">{entry.title}</p>
                              <span className="text-[10px] text-muted-foreground">
                                {timeAgo(entry.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {entry.description}
                            </p>
                            {entry.attachment && (
                              <div className="mt-3 p-2 bg-muted rounded border border-border/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-primary">
                                    description
                                  </span>
                                  <span className="text-[10px] font-medium text-foreground">
                                    {entry.attachment.name}
                                  </span>
                                </div>
                                {entry.attachment.downloadUrl && (
                                  <a
                                    href={entry.attachment.downloadUrl}
                                    className="text-[10px] text-primary font-bold hover:underline"
                                  >
                                    Download
                                  </a>
                                )}
                              </div>
                            )}
                            {entry.user && (
                              <div className="mt-3 flex items-center gap-2">
                                <Avatar name={entry.user.name} url={entry.user.avatarUrl} />
                                <span className="text-[10px] text-muted-foreground">
                                  {entry.user.name}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {caseData.description && (
                        <div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {caseData.description}
                          </p>
                        </div>
                      )}
                      <EmptyState entity="timeline" phase="passive" />
                    </div>
                  )}
                </div>
              )}

              {/* ── Activities Tab ── */}
              {activeTab === 'activities' && (
                <div className="space-y-6">
                  <ActivityFeed entityType="CASE" entityId={caseData.id} height={400} />
                  <DeadlineTracker
                    tasks={caseData.tasks}
                    onAddTask={onAddTask}
                    onCompleteTask={onCompleteTask}
                    onRemoveTask={onRemoveTask}
                    disabled={isClosed}
                  />
                </div>
              )}

              {/* ── Evidence Tab ── */}
              {activeTab === 'evidence' && <DocumentLinks caseId={caseData.id} />}

              {/* ── Records Tab ── */}
              {activeTab === 'records' && (
                <PartyManager parties={parties} onUpdate={onUpdateParties} disabled={isClosed} />
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column: Metrics & Context ── */}
        <div className="xl:col-span-3 space-y-6">
          {/* Case Health */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-4">Case Health</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Resolution Progress</p>
                  <span className="text-xs font-bold text-primary">{resolutionProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${resolutionProgress}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Budget Consumed</p>
                  <span className="text-xs font-bold text-amber-600">{budgetConsumed}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all"
                    style={{ width: `${budgetConsumed}%` }}
                  />
                </div>
              </div>
              <div className="pt-2 grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase">SLA Days</p>
                  <p className="text-lg font-black text-foreground">{slaDays}</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase">
                    Items Open
                  </p>
                  <p className="text-lg font-black text-foreground">{openItems}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Deadlines */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-foreground">Deadlines</h3>
              <button className="text-[10px] text-primary font-bold">View Calendar</button>
            </div>
            <div className="space-y-3">
              {caseData.tasks
                .filter((t) => t.dueDate && t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
                .slice(0, 4)
                .map((task) => {
                  const ds = formatDeadlineShort(task.dueDate);
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'flex gap-3 p-2 hover:bg-muted rounded-lg transition-colors border-l-4',
                        task.isOverdue ? 'border-red-500' : 'border-amber-500'
                      )}
                    >
                      {ds && (
                        <div className="flex flex-col items-center justify-center bg-muted rounded min-w-[36px] h-9">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">
                            {ds.month}
                          </span>
                          <span className="text-sm font-black text-foreground">{ds.day}</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{task.title}</p>
                        {task.description && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {task.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              {caseData.appointments.slice(0, 2).map((apt) => {
                const ds = formatDeadlineShort(apt.startTime);
                return (
                  <div
                    key={apt.id}
                    className="flex gap-3 p-2 hover:bg-muted rounded-lg transition-colors border-l-4 border-blue-500"
                  >
                    {ds && (
                      <div className="flex flex-col items-center justify-center bg-muted rounded min-w-[36px] h-9">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                          {ds.month}
                        </span>
                        <span className="text-sm font-black text-foreground">{ds.day}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{apt.title}</p>
                      {apt.location && (
                        <p className="text-[10px] text-muted-foreground truncate">{apt.location}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {caseData.tasks.filter(
                (t) => t.dueDate && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
              ).length === 0 &&
                caseData.appointments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No upcoming deadlines
                  </p>
                )}
            </div>
          </div>

          {/* Key Stakeholders */}
          {parties.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <h3 className="text-sm font-bold text-foreground mb-4">Key Stakeholders</h3>
              <div className="space-y-4">
                {parties.slice(0, 5).map((party) => (
                  <div key={party.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={party.name} url={party.avatarUrl} size="md" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{party.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {PARTY_ROLE_LABELS[party.role] || party.role}
                        </p>
                      </div>
                    </div>
                    <button className="p-1.5 text-muted-foreground hover:text-primary shrink-0">
                      <span className="material-symbols-outlined text-sm">
                        {party.email ? 'mail' : 'call'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Close Dialog */}
      {showCloseDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground mb-4">Close Case</h3>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Enter resolution summary..."
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-sm mb-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              aria-label="Resolution summary"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCloseDialog(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                disabled={!resolution.trim()}
                className="px-4 py-2 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Close Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PARTY_ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Client Lead',
  OPPOSING_COUNSEL: 'Opposing Counsel',
  WITNESS: 'Witness',
  EXPERT: 'Expert',
  JUDGE: 'Judge',
  OTHER: 'Other',
};
