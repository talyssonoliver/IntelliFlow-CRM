'use client';

/**
 * DeadlineTracker Component (PG-138)
 *
 * Interactive task/deadline management for cases.
 */

import { useState } from 'react';
import { cn } from '@intelliflow/ui';
import { getTaskStatusConfig, formatDeadline } from '@/lib/cases/case-utils';
import type { CaseTaskItem } from './types';

interface DeadlineTrackerProps {
  tasks: CaseTaskItem[];
  onAddTask: (task: {
    title: string;
    description?: string;
    dueDate?: Date;
    assignee?: string;
  }) => void;
  onCompleteTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  disabled?: boolean;
}

export function DeadlineTracker({
  tasks,
  onAddTask,
  onCompleteTask,
  onRemoveTask,
  disabled,
}: Readonly<DeadlineTrackerProps>) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddTask({
      title: title.trim(),
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    setTitle('');
    setDueDate('');
    setShowForm(false);
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return 1;
    if (a.status !== 'COMPLETED' && b.status === 'COMPLETED') return -1;
    if (a.dueDate && b.dueDate)
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  return (
    <div>
      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>
              {completedCount}/{totalCount} tasks completed
            </span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Task List */}
      {sortedTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No tasks yet</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {sortedTasks.map((task) => {
            const statusCfg = getTaskStatusConfig(task.status);
            return (
              <li key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-md border">
                {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' ? (
                  <button
                    onClick={() => onCompleteTask(task.id)}
                    disabled={disabled}
                    className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 flex-shrink-0 disabled:opacity-50"
                    aria-label={`Complete task: ${task.title}`}
                  />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">✓</span>
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <span
                    className={cn(
                      'text-sm',
                      task.status === 'COMPLETED' && 'line-through text-muted-foreground'
                    )}
                  >
                    {task.title}
                  </span>
                  {task.dueDate && (
                    <span
                      className={cn(
                        'text-xs ml-2',
                        task.isOverdue ? 'text-red-600' : 'text-muted-foreground'
                      )}
                    >
                      {formatDeadline(task.dueDate)}
                      {task.isOverdue && ' (Overdue)'}
                    </span>
                  )}
                </div>
                <span className={cn('text-xs', statusCfg.color)}>{statusCfg.label}</span>
                {!disabled && task.status !== 'COMPLETED' && (
                  <button
                    onClick={() => onRemoveTask(task.id)}
                    className="text-muted-foreground hover:text-red-600 text-sm"
                    aria-label={`Remove task: ${task.title}`}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add Task Form */}
      {!disabled &&
        (showForm ? (
          <form onSubmit={handleSubmit} className="space-y-2 p-3 border rounded-md">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="w-full px-3 py-1.5 text-sm border rounded-md bg-background"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              aria-label="Task title"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded-md bg-background"
              aria-label="Due date"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-3 py-1 text-sm font-medium text-white bg-primary rounded-md"
              >
                Add Task
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1 text-sm border rounded-md"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full px-4 py-2 text-sm border-2 border-dashed rounded-md text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
          >
            + Add Task
          </button>
        ))}
    </div>
  );
}
