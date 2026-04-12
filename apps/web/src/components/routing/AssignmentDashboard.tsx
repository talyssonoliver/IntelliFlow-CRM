'use client';

/**
 * AssignmentDashboard
 *
 * PG-132: Smart Lead Routing UI
 *
 * Shows stats cards and recent lead assignments.
 * Auto-refreshes via 30-second polling from useRouting hook.
 */

import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@intelliflow/ui';
import { useRouting } from '@/app/settings/routing/hooks/useRouting';

interface AssignmentItem {
  id: string;
  createdAt: Date | string;
  reason: string;
  details?: Record<string, unknown> | null;
  rule?: { name: string } | null;
  assignedTo?: { id: string; name: string | null; email: string } | null;
}

interface RoutingRuleItem {
  id: string;
  isActive: boolean;
}
/** Format a date as relative time (e.g., "5 minutes ago") */
function formatTimeAgo(date: Readonly<Date>): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

interface StatsCardProps {
  icon: string;
  label: string;
  value: string | number;
  loading?: boolean;
}

function StatsCard({ icon, label, value, loading }: Readonly<StatsCardProps>) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <span className="material-symbols-outlined text-[24px] text-primary">{icon}</span>
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AssignmentDashboard() {
  const { assignments, assignmentsLoading, rules, rulesLoading } = useRouting();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayAssignments =
    (assignments as AssignmentItem[] | undefined)?.filter((a) => new Date(a.createdAt) >= today) ??
    [];

  const activeRules =
    (rules as RoutingRuleItem[] | undefined)?.filter((r) => r.isActive)?.length ?? 0;
  const loading = assignmentsLoading || rulesLoading;

  return (
    <div className="space-y-6">
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        aria-live="polite"
        aria-label="Assignment statistics"
      >
        <StatsCard
          icon="assignment_turned_in"
          label="Assigned Today"
          value={todayAssignments.length}
          loading={loading}
        />
        <StatsCard icon="timer" label="Avg Assignment Time" value="< 1s" loading={loading} />
        <StatsCard icon="rule" label="Active Rules" value={activeRules} loading={loading} />
        <StatsCard icon="person_off" label="Unassigned Leads" value="—" loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            if (loading)
              return (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              );
            if (!assignments || assignments.length === 0)
              return <EmptyState entity="leads" phase="passive" />;
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Lead</th>
                      <th className="pb-2 font-medium">Assigned To</th>
                      <th className="pb-2 font-medium">Rule</th>
                      <th className="pb-2 font-medium">Reason</th>
                      <th className="pb-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(assignments as AssignmentItem[]).map((assignment) => (
                      <tr key={assignment.id} className="border-b last:border-0">
                        <td className="py-2">
                          {(assignment.details?.leadId as string | undefined)?.slice(0, 8) ?? '—'}
                        </td>
                        <td className="py-2">{assignment.assignedTo?.name ?? '—'}</td>
                        <td className="py-2">{assignment.rule?.name ?? '—'}</td>
                        <td className="py-2">
                          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs">
                            {assignment.reason}
                          </span>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {formatTimeAgo(new Date(assignment.createdAt))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
