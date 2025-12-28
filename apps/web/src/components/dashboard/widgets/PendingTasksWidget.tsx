'use client';

import type { WidgetProps } from './index';

interface Task {
  id: string;
  title: string;
  dueDate: string;
  isOverdue?: boolean;
}

const sampleTasks: Task[] = [
  { id: '1', title: 'Call with Acme Corp', dueDate: 'Today, 2:00 PM' },
  { id: '2', title: 'Review Q3 Report', dueDate: 'Tomorrow, 10:00 AM' },
  { id: '3', title: 'Email follow-up: Sarah', dueDate: 'Overdue', isOverdue: true },
];

export function PendingTasksWidget(_props: WidgetProps) {
  return (
    <div className="p-5 flex flex-col h-full">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400">check_circle</span>
        Pending Tasks
      </h3>

      <div className="flex flex-col gap-3 overflow-y-auto max-h-[240px] pr-2 flex-1">
        {sampleTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer group/item"
          >
            <input
              type="checkbox"
              className="mt-1 rounded border-slate-300 text-ds-primary focus:ring-ds-primary bg-transparent"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover/item:text-ds-primary transition-colors">
                {task.title}
              </p>
              <p className={`text-xs ${task.isOverdue ? 'text-red-500' : 'text-slate-500'}`}>
                {task.dueDate}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button className="mt-auto w-full py-2 text-sm text-ds-primary font-medium hover:bg-ds-primary/5 rounded-lg border border-transparent hover:border-ds-primary/20 transition-all">
        + Add New Task
      </button>
    </div>
  );
}
