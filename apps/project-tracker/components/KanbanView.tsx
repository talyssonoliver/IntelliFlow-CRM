'use client';

import { Task } from '@/lib/types';
import { getInitials, truncate } from '@/lib/utils';

interface KanbanViewProps {
  readonly tasks: Task[];
  readonly onTaskClick: (task: Task) => void;
}

export default function KanbanView({ tasks, onTaskClick }: KanbanViewProps) {
  const columns = [
    { id: 'backlog', title: 'Backlog', statuses: ['Backlog', 'In Review'] },
    { id: 'planned', title: 'Planned', statuses: ['Planned'] },
    { id: 'inprogress', title: 'In Progress', statuses: ['In Progress', 'Validating'] },
    { id: 'blocked', title: 'Blocked', statuses: ['Blocked', 'Needs Human', 'Failed'] },
    { id: 'completed', title: 'Completed', statuses: ['Completed', 'Done'] },
  ];

  const getTasksForColumn = (statuses: string[]) => {
    return tasks.filter((t) => statuses.includes(t.status));
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-5 gap-2">
        {columns.map((column) => {
          const columnTasks = getTasksForColumn(column.statuses);

          return (
            <div key={column.id} className="min-w-0">
              <div className="bg-gray-100 rounded-lg p-2.5">
                {/* Column Header */}
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="font-semibold text-gray-900 text-sm">{column.title}</h3>
                  <span className="bg-gray-200 text-gray-700 text-xs font-medium px-1.5 py-0.5 rounded-full">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Tasks */}
                <div className="space-y-2 min-h-[200px]">
                  {columnTasks.map((task) => {
                    // Determine priority based on section
                    let priority: 'high' | 'medium' | 'low';
                    if (task.section.includes('Security')) {
                      priority = 'high';
                    } else if (task.section.includes('Core')) {
                      priority = 'medium';
                    } else {
                      priority = 'low';
                    }

                    let priorityColor: string;
                    if (priority === 'high') {
                      priorityColor = 'border-red-500';
                    } else if (priority === 'medium') {
                      priorityColor = 'border-yellow-500';
                    } else {
                      priorityColor = 'border-green-500';
                    }

                    return (
                      <button
                        key={task.id}
                        onClick={() => onTaskClick(task)}
                        type="button"
                        className={`w-full text-left bg-white rounded-lg p-2.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 ${priorityColor}`}
                      >
                        {/* Task ID */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-gray-500">{task.id}</span>
                          <span className="text-xs text-gray-400">Sprint {task.sprint}</span>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-gray-900 mb-2">
                          {truncate(task.description, 60)}
                        </p>

                        {/* Section Tag */}
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {task.section}
                          </span>

                          {/* Owner Avatar */}
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                            {getInitials(task.owner)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
