'use client';

import { Card } from '@intelliflow/ui';
import type { TaskStatus, TaskPriority } from '@intelliflow/domain';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

type DateStringNull = Date | string | null;

export interface TaskCardProps {
  readonly task: {
    readonly id: string;
    readonly title: string;
    readonly description: string | null;
    readonly dueDate: DateStringNull;
    readonly priority: TaskPriority;
    readonly status: TaskStatus;
    readonly lead?: { id: string; firstName: string; lastName: string } | null;
    readonly contact?: { id: string; firstName: string; lastName: string } | null;
    readonly opportunity?: { id: string; name: string } | null;
  };
  readonly onClick?: (id: string) => void;
}

const PRIORITY_STYLES: Record<string, { color: string; icon: string }> = {
  LOW: { color: 'text-gray-500', icon: 'flag' },
  MEDIUM: { color: 'text-yellow-500', icon: 'flag' },
  HIGH: { color: 'text-orange-500', icon: 'flag' },
  URGENT: { color: 'text-red-500', icon: 'priority_high' },
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

function formatDueDate(date: DateStringNull, timezone: string = 'Europe/London'): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: timezone });
}

function getDueDateStatus(date: DateStringNull): 'overdue' | 'today' | 'normal' {
  if (!date) return 'normal';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'normal';
}

function getEntityInfo(
  task: TaskCardProps['task']
): { type: string; name: string; href: string } | null {
  if (task.lead)
    return {
      type: 'lead',
      name: `${task.lead.firstName} ${task.lead.lastName}`,
      href: `/leads/${task.lead.id}`,
    };
  if (task.contact)
    return {
      type: 'contact',
      name: `${task.contact.firstName} ${task.contact.lastName}`,
      href: `/contacts/${task.contact.id}`,
    };
  if (task.opportunity)
    return { type: 'deal', name: task.opportunity.name, href: `/deals/${task.opportunity.id}` };
  return null;
}

const ENTITY_ICONS: Record<string, string> = {
  lead: 'group',
  contact: 'person',
  deal: 'handshake',
};

export function TaskCard({ task, onClick }: Readonly<TaskCardProps>) {
  const { timezone } = useTimezoneContext();
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.MEDIUM;
  const statusStyle = STATUS_STYLES[task.status] ?? STATUS_STYLES.PENDING;
  const dueDisplay = formatDueDate(task.dueDate, timezone);
  const dueStatus = getDueDateStatus(task.dueDate);
  const entity = getEntityInfo(task);

  let dueDateColor: string;
  if (dueStatus === 'overdue') {
    dueDateColor = 'text-red-600 dark:text-red-400';
  } else if (dueStatus === 'today') {
    dueDateColor = 'text-amber-600 dark:text-amber-400';
  } else {
    dueDateColor = 'text-muted-foreground';
  }

  return (
    <Card
      className="p-3 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => onClick?.(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(task.id);
        }
      }}
      aria-label={`View task: ${task.title}`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`material-symbols-outlined text-base ${priority.color}`}
          aria-hidden="true"
        >
          {priority.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {dueDisplay && <span className={`text-xs ${dueDateColor}`}>Due: {dueDisplay}</span>}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle}`}
            >
              {task.status.replaceAll('_', ' ')}
            </span>
          </div>
          {entity && (
            <div className="flex items-center gap-1 mt-1">
              <span
                className="material-symbols-outlined text-xs text-muted-foreground"
                aria-hidden="true"
              >
                {ENTITY_ICONS[entity.type]}
              </span>
              <a
                href={entity.href}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-primary hover:underline truncate"
              >
                {entity.name}
              </a>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
