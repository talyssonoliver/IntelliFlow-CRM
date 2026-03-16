'use client';

/**
 * AgentWorkload
 *
 * PG-132: Smart Lead Routing UI
 *
 * Displays agent cards with capacity gauges, skills, and availability status.
 */

import { Card, CardContent, Progress, Skeleton } from '@intelliflow/ui';
import { useRouting } from '@/app/settings/routing/hooks/useRouting';
import type { AgentStatusType } from '@intelliflow/domain';

interface AgentSkill {
  id: string;
  skillName: string;
  proficiency: number;
}

interface AgentWorkloadItem {
  id: string;
  userId: string;
  status: string;
  currentCapacity: number;
  maxCapacity: number;
  shiftStart?: Date | string | null;
  shiftEnd?: Date | string | null;
  user?: { id: string; name: string | null; email: string } | null;
  skills?: AgentSkill[];
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ONLINE: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    label: 'Online',
  },
  BUSY: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    label: 'Busy',
  },
  AWAY: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-400',
    label: 'Away',
  },
  OFFLINE: {
    bg: 'bg-gray-200 dark:bg-gray-900',
    text: 'text-gray-500 dark:text-gray-500',
    label: 'Offline',
  },
  ON_BREAK: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
    label: 'On Break',
  },
};

function formatTime(date: Date | string | null, timezone: string = 'UTC'): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: timezone });
}

export function AgentWorkload() {
  const { agentWorkload, agentWorkloadLoading } = useRouting();

  if (agentWorkloadLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!agentWorkload || agentWorkload.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <span className="material-symbols-outlined text-[36px] mb-2 block">groups_off</span>
          <p>No agents configured</p>
          <p className="text-sm mt-1">Agent availability will appear here once configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {(agentWorkload as AgentWorkloadItem[]).map((agent) => {
        // NOSONAR
        const status = (agent.status as AgentStatusType) || 'OFFLINE'; // NOSONAR
        const style = STATUS_STYLES[status] || STATUS_STYLES.OFFLINE;
        const capacity =
          agent.maxCapacity > 0 ? Math.round((agent.currentCapacity / agent.maxCapacity) * 100) : 0;

        return (
          <Card key={agent.id}>
            <CardContent className="p-4 space-y-3">
              {/* Header: Avatar + Name + Status */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  {(agent.user?.name ?? 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{agent.user?.name ?? 'Unknown'}</p>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
                  >
                    {style.label}
                  </span>
                </div>
              </div>

              {/* Capacity Gauge */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1" id={`capacity-label-${agent.id}`}>
                  <span>Capacity</span>
                  <span>
                    {agent.currentCapacity}/{agent.maxCapacity}
                  </span>
                </div>
                <Progress
                  value={capacity}
                  className="h-2"
                  aria-labelledby={`capacity-label-${agent.id}`}
                />
              </div>

              {/* Skills */}
              {agent.skills && agent.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {agent.skills.map((skill: AgentSkill) => (
                    <span
                      key={skill.id}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
                    >
                      {skill.skillName}
                      <span className="text-muted-foreground">({skill.proficiency}/5)</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Shift */}
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                {formatTime(agent.shiftStart ?? null)} – {formatTime(agent.shiftEnd ?? null)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
