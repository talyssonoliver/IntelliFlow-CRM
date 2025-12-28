'use client';

import Link from 'next/link';
import type { WidgetProps } from './index';

interface Task {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
}

const tasks: Task[] = [
  { id: '1', title: 'Call Sarah re: contract', priority: 'high', dueDate: 'Due Today' },
  { id: '2', title: 'Follow up with TechCorp', priority: 'medium', dueDate: 'Due Tomorrow' },
  { id: '3', title: 'Prepare Q3 Report', priority: 'low', dueDate: 'Due Oct 24' },
];

const priorityColors = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-green-600 dark:text-green-400',
};

export function UpcomingTasksWidget(_props: WidgetProps) {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Upcoming Tasks</h3>
        <Link href="/tasks" className="text-sm text-ds-primary hover:underline">
          View All
        </Link>
      </div>

      <div className="space-y-3 flex-1">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <input
              type="checkbox"
              className="mt-1 rounded border-slate-300 dark:border-slate-600"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-medium capitalize ${priorityColors[task.priority]}`}>
                  {task.priority}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{task.dueDate}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
