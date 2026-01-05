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
      <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-muted-foreground">check_circle</span>
        Pending Tasks
      </h3>

      <div className="flex flex-col gap-3 overflow-y-auto max-h-[240px] pr-2 flex-1">
        {sampleTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-3 p-2 hover:bg-muted rounded-lg transition-colors cursor-pointer group/item"
          >
            <input
              type="checkbox"
              className="mt-1 rounded border-border text-primary focus:ring-primary bg-transparent"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground group-hover/item:text-primary transition-colors">
                {task.title}
              </p>
              <p className={`text-xs ${task.isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                {task.dueDate}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button className="mt-auto w-full py-2 text-sm text-primary font-medium hover:bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all">
        + Add New Task
      </button>
    </div>
  );
}
