'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  TrendingUp,
  Target,
  AtSign,
  Calendar,
  Brain,
  Ticket,
  FileText,
  Mail,
  Shield,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { PageHeader } from '@/components/shared';
import { trpc } from '@/lib/trpc';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Skeleton,
  StatusBadge,
  toast,
} from '@intelliflow/ui';
import { cn } from '@/lib/utils';

// =============================================================================
// Channels — the 4 user-facing delivery channels
// =============================================================================

const CHANNELS = ['in_app', 'email', 'push', 'sms'] as const;

const CHANNEL_LABELS: Record<string, string> = {
  in_app: 'In-App',
  email: 'Email',
  push: 'Push',
  sms: 'SMS',
};

// =============================================================================
// Friendly display names for notification types
// =============================================================================

const TYPE_LABELS: Record<string, string> = {
  lead_assigned: 'Lead Assigned',
  lead_scored: 'Lead Scored',
  lead_converted: 'Lead Converted',
  lead_activity: 'Lead Activity',
  deal_assigned: 'Deal Assigned',
  deal_stage_changed: 'Deal Stage Changed',
  deal_won: 'Deal Won',
  deal_lost: 'Deal Lost',
  deal_at_risk: 'Deal at Risk',
  task_assigned: 'Task Assigned',
  task_due_soon: 'Task Due Soon',
  task_overdue: 'Task Overdue',
  task_completed: 'Task Completed',
  task_comment: 'Task Comment',
  appointment_scheduled: 'Appointment Scheduled',
  appointment_reminder: 'Appointment Reminder',
  appointment_cancelled: 'Appointment Cancelled',
  appointment_rescheduled: 'Appointment Rescheduled',
  ai_insight: 'AI Insight',
  ai_action_pending: 'Action Pending Approval',
  ai_action_approved: 'Action Approved',
  ai_action_rejected: 'Action Rejected',
  ai_recommendation: 'AI Recommendation',
  team_mention: 'Mentioned in Conversation',
  team_message: 'Team Message',
  team_announcement: 'Team Announcement',
  system_alert: 'System Alert',
  system_maintenance: 'Scheduled Maintenance',
  system_update: 'System Update',
  document_shared: 'Document Shared',
  document_comment: 'Document Comment',
  document_approval_needed: 'Document Approval Needed',
  ticket_assigned: 'Ticket Assigned',
  ticket_created: 'Ticket Created',
  ticket_escalated: 'Ticket Escalated',
  case_assigned: 'Case Assigned',
  case_status_changed: 'Case Status Changed',
  case_closed: 'Case Closed',
  contact_stale: 'Stale Contact Alert',
  email_received: 'Email Received',
  email_opened: 'Email Opened',
  email_replied: 'Email Replied',
};

function formatTypeName(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// =============================================================================
// Category definitions
// =============================================================================

interface CategoryDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  prefixes: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'tasks',
    label: 'Tasks & Deadlines',
    description: 'Task assignments, due dates, and reminders',
    icon: CheckSquare,
    iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    prefixes: ['task_'],
  },
  {
    id: 'deals',
    label: 'Deals & Pipeline',
    description: 'Deal stage changes, won/lost deals, and risk alerts',
    icon: TrendingUp,
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
    prefixes: ['deal_'],
  },
  {
    id: 'leads',
    label: 'Leads & Contacts',
    description: 'Lead scoring, conversions, and stale contact alerts',
    icon: Target,
    iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
    prefixes: ['lead_', 'contact_'],
  },
  {
    id: 'team',
    label: 'Mentions & Team',
    description: 'When someone mentions you or sends team updates',
    icon: AtSign,
    iconBg: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400',
    prefixes: ['team_'],
  },
  {
    id: 'appointments',
    label: 'Appointments & Calendar',
    description: 'Scheduling, reminders, and cancellations',
    icon: Calendar,
    iconBg: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400',
    prefixes: ['appointment_'],
  },
  {
    id: 'tickets',
    label: 'Tickets & Cases',
    description: 'Support ticket assignments, escalations, and case updates',
    icon: Ticket,
    iconBg: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
    prefixes: ['ticket_', 'case_'],
  },
  {
    id: 'ai',
    label: 'AI Insights',
    description: 'Smart suggestions, predictions, and agent actions',
    icon: Brain,
    iconBg: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
    prefixes: ['ai_'],
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Shared documents, comments, and approval requests',
    icon: FileText,
    iconBg: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
    prefixes: ['document_'],
  },
  {
    id: 'email',
    label: 'Email Activity',
    description: 'Incoming emails, opens, and replies',
    icon: Mail,
    iconBg: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
    prefixes: ['email_'],
  },
  {
    id: 'system',
    label: 'System & Security',
    description: 'Password changes, maintenance, and system alerts',
    icon: Shield,
    iconBg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    prefixes: ['system_'],
  },
];

// =============================================================================
// Priority levels — configurable delivery per priority
// =============================================================================

interface PriorityOption {
  id: string;
  label: string;
}

const PRIORITY_LEVELS: PriorityOption[] = [
  { id: 'low', label: 'Low & above' },
  { id: 'normal', label: 'Normal & above' },
  { id: 'high', label: 'High & above' },
  { id: 'urgent', label: 'Urgent only' },
];

// =============================================================================
// Types
// =============================================================================

interface PrefItem {
  type: string;
  enabled: boolean;
  channels: string[];
  frequency?: string;
  quietHours?: { start: string; end: string; days: string[] };
}

/** Cast API preferences to local PrefItem shape */
function toPrefItems(prefs: Array<Record<string, unknown>>): PrefItem[] {
  return prefs.map((p) => ({
    type: String(p.type),
    enabled: Boolean(p.enabled),
    channels: (p.channels as string[]) ?? [],
    frequency: p.frequency as string | undefined,
    quietHours: p.quietHours as PrefItem['quietHours'],
  }));
}

// =============================================================================
// Helpers
// =============================================================================

/** Check if ANY item in the group has a given channel enabled */
function categoryHasChannel(items: PrefItem[], channel: string): boolean {
  return items.some((p) => p.channels.includes(channel));
}

/** Toggle a channel for ALL items in a category at once */
function toggleCategoryChannel(
  preferences: PrefItem[],
  items: PrefItem[],
  channel: string
): PrefItem[] {
  const typeSet = new Set(items.map((i) => i.type));
  const allHave = items.every((p) => p.channels.includes(channel));
  return preferences.map((pref) => {
    if (!typeSet.has(pref.type)) return pref;
    let channels: string[];
    if (allHave) {
      channels = pref.channels.filter((c) => c !== channel);
    } else if (pref.channels.includes(channel)) {
      channels = pref.channels;
    } else {
      channels = [...pref.channels, channel];
    }
    return { ...pref, channels };
  });
}

// =============================================================================
// Main page
// =============================================================================

export default function NotificationSettingsPage() {
  useRequireAuth();

  const { data, isLoading, isError, refetch } = trpc.notifications.getPreferences.useQuery();
  const utils = trpc.useUtils();

  const mutation = trpc.notifications.updatePreferences.useMutation({
    onSuccess: () => {
      utils.notifications.getPreferences.invalidate();
      toast({
        title: 'Preferences updated',
        description: 'Your notification preferences have been saved.',
      });
    },
    onError: (err: { message: string }) => {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    },
  });

  const [preferences, setPreferences] = useState<PrefItem[]>([]);
  const [prefsInitialized, setPrefsInitialized] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState((data as any)?.priorityFilter || 'normal');

  if (data && !prefsInitialized) {
    setPreferences(toPrefItems((data.preferences as Array<Record<string, unknown>>) || []));
    setPrefsInitialized(true);
  }

  const categorized = useMemo(() => {
    const assigned = new Set<string>();
    return CATEGORIES.map((cat) => {
      const items = preferences.filter((p) => {
        if (assigned.has(p.type)) return false;
        const matches = cat.prefixes.some((prefix) => p.type.startsWith(prefix));
        if (matches) assigned.add(p.type);
        return matches;
      });
      return { category: cat, items };
    }).filter((group) => group.items.length > 0);
  }, [preferences]);

  const toggleExpand = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const savePrefs = useCallback(
    (updated: PrefItem[]) => {
      setPreferences(updated);
      mutation.mutate({
        preferences: updated as Parameters<typeof mutation.mutate>[0]['preferences'],
      });
    },
    [mutation]
  );

  const handleCategoryToggle = useCallback(
    (items: PrefItem[], channel: string) => {
      savePrefs(toggleCategoryChannel(preferences, items, channel));
    },
    [preferences, savePrefs]
  );

  const handleTypeToggle = useCallback(
    (type: string, channel: string) => {
      const updated = preferences.map((pref) => {
        if (pref.type !== type) return pref;
        const channels = pref.channels.includes(channel)
          ? pref.channels.filter((c) => c !== channel)
          : [...pref.channels, channel];
        return { ...pref, channels };
      });
      savePrefs(updated);
    },
    [preferences, savePrefs]
  );

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="skeleton">
        <PageHeader
          breadcrumbs={[{ label: 'Notifications', href: '/notifications' }, { label: 'Settings' }]}
          title="Notification Settings"
        />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: 'Notifications', href: '/notifications' }, { label: 'Settings' }]}
          title="Notification Settings"
        />
        <div className="text-center py-8">
          <p className="text-destructive mb-4">Failed to load notification preferences</p>
          <Button variant="outline" onClick={() => refetch()} aria-label="Retry">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const channelCount = data?.defaultChannels?.length ?? 0;
  const quietHoursEnabled = data?.quietHours?.enabled ?? false;
  const quietHoursSchedule = quietHoursEnabled
    ? `${data?.quietHours?.start} – ${data?.quietHours?.end}`
    : 'Disabled';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Notifications', href: '/notifications' }, { label: 'Settings' }]}
        title="Notification Settings"
        description="Manage how and when you receive updates from IntelliFlow."
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/notifications/channels" aria-label="Channels">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Channels</h3>
                <StatusBadge status={channelCount > 0 ? 'Active' : 'Disabled'} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {channelCount} channel{channelCount !== 1 ? 's' : ''} enabled
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/notifications/quiet-hours" aria-label="Quiet Hours">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Quiet Hours</h3>
                <StatusBadge status={quietHoursEnabled ? 'Active' : 'Disabled'} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{quietHoursSchedule}</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Notification Types — matrix with 4 channels */}
      {categorized.length > 0 && (
        <Card>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_repeat(4,56px)] items-center gap-1 border-b bg-muted/50 px-5 py-3">
            <span className="text-sm font-semibold">Notification Types</span>
            {CHANNELS.map((ch) => (
              <span
                key={ch}
                className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {CHANNEL_LABELS[ch]}
              </span>
            ))}
          </div>

          {/* Category rows */}
          {categorized.map(({ category, items }) => {
            const Icon = category.icon;
            const expanded = expandedCategories.has(category.id);

            return (
              <div key={category.id} className="border-b last:border-b-0">
                {/* Category row — icon + label + description + 4 checkboxes */}
                <div className="grid grid-cols-[1fr_repeat(4,56px)] items-center gap-1 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                  {/* Left: expand toggle + icon + text */}
                  <button
                    type="button"
                    className="flex items-center gap-3 text-left min-w-0"
                    onClick={() => toggleExpand(category.id)}
                    aria-expanded={expanded}
                    aria-controls={`category-${category.id}`}
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                        expanded && 'rotate-180'
                      )}
                    />
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        category.iconBg
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{category.label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {category.description}
                      </div>
                    </div>
                  </button>

                  {/* Right: 4 channel checkboxes (category-level toggles) */}
                  {CHANNELS.map((ch) => (
                    <div key={ch} className="flex justify-center">
                      <input
                        type="checkbox"
                        className="h-[15px] w-[15px] rounded border-input accent-primary cursor-pointer"
                        checked={categoryHasChannel(items, ch)}
                        onChange={() => handleCategoryToggle(items, ch)}
                        aria-label={`${category.label} ${CHANNEL_LABELS[ch]}`}
                      />
                    </div>
                  ))}
                </div>

                {/* Expanded: granular per-type rows */}
                {expanded && (
                  <div id={`category-${category.id}`} className="border-t bg-muted/20 pb-3">
                    {items.map((pref) => (
                      <div
                        key={pref.type}
                        className="grid grid-cols-[1fr_repeat(4,56px)] items-center gap-1 border-t border-border/40 px-5 py-2.5 hover:bg-muted/40 transition-colors"
                      >
                        <span className="pl-16 text-sm text-foreground/80">
                          {formatTypeName(pref.type)}
                        </span>
                        {CHANNELS.map((ch) => (
                          <div key={ch} className="flex justify-center">
                            <input
                              type="checkbox"
                              className="h-[15px] w-[15px] rounded border-input accent-primary cursor-pointer"
                              checked={pref.channels.includes(ch)}
                              onChange={() => handleTypeToggle(pref.type, ch)}
                              aria-label={`${formatTypeName(pref.type)} ${CHANNEL_LABELS[ch]}`}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* Priority Filtering */}
      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold">Priority Filtering</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Only receive notifications with a priority level of:
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2">
            {PRIORITY_LEVELS.map((level) => (
              <div key={level.id} className="flex items-center">
                <input
                  type="radio"
                  id={`priority-${level.id}`}
                  name="priority-filter"
                  checked={priorityFilter === level.id}
                  onChange={() => {
                    setPriorityFilter(level.id);
                    mutation.mutate({
                      priorityFilter: level.id as 'low' | 'normal' | 'high' | 'urgent',
                    });
                  }}
                  className="h-4 w-4 border-input text-primary focus:ring-primary"
                />
                <label
                  htmlFor={`priority-${level.id}`}
                  className="ml-3 block text-sm font-medium leading-6"
                >
                  {level.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
