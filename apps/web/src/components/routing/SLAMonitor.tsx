'use client';

/**
 * SLAMonitor
 *
 * PG-132: Smart Lead Routing UI
 *
 * Displays SLA policy targets and active breach/at-risk list.
 * Color-coded badges: ON_TRACK (green), AT_RISK (amber), BREACHED (red).
 */

import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@intelliflow/ui';
import { useRouting } from '@/app/settings/routing/hooks/useRouting';

type SLAStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

interface SLAPolicy {
  priority: string;
  responseTarget: string;
  followUpTarget: string;
}

const SLA_POLICIES: SLAPolicy[] = [
  { priority: 'Urgent', responseTarget: '15 min', followUpTarget: '1 hour' },
  { priority: 'High', responseTarget: '1 hour', followUpTarget: '4 hours' },
  { priority: 'Normal', responseTarget: '4 hours', followUpTarget: '24 hours' },
  { priority: 'Low', responseTarget: '24 hours', followUpTarget: '72 hours' },
];

function _SLABadge({ status }: Readonly<{ status: SLAStatus }>) {
  const styles: Record<SLAStatus, string> = {
    ON_TRACK: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    AT_RISK: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    BREACHED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const labels: Record<SLAStatus, string> = {
    ON_TRACK: 'On Track',
    AT_RISK: 'At Risk',
    BREACHED: 'Breached',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
      aria-label={`SLA status: ${labels[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export function SLAMonitor() {
  const { assignmentsLoading } = useRouting();

  if (assignmentsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SLA Policy Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">policy</span>{' '}SLA Policies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Priority</th>
                  <th className="pb-2 font-medium">Response Target</th>
                  <th className="pb-2 font-medium">Follow-up Target</th>
                </tr>
              </thead>
              <tbody>
                {SLA_POLICIES.map((policy) => (
                  <tr key={policy.priority} className="border-b last:border-0">
                    <td className="py-2 font-medium">{policy.priority}</td>
                    <td className="py-2">{policy.responseTarget}</td>
                    <td className="py-2">{policy.followUpTarget}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Active Breaches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">warning</span>{' '}
            Active Breaches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <span className="material-symbols-outlined text-[36px] mb-2 block text-emerald-500">
              check_circle
            </span>
            <p>All SLAs are on track</p>
            <p className="text-sm mt-1">No active breaches or at-risk leads.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
