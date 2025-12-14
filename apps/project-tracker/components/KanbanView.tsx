'use client';

import { Task } from '@/lib/types';
import { getInitials, truncate } from '@/lib/utils';

interface KanbanViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export default function KanbanView({ tasks, onTaskClick }: KanbanViewProps) {
  const columns = [
    { id: 'backlog', title: 'Backlog', status: 'Planned' },
    { id: 'todo', title: 'To Do', status: 'Planned' },
    { id: 'inprogress', title: 'In Progress', status: 'In Progress' },
    { id: 'review', title: 'Review', status: 'Completed' },
    { id: 'done', title: 'Done', status: 'Completed' },
  ];

  const getTasksForColumn = (columnId: string, status: string) => {
    if (columnId === 'backlog') {
      // Show first half of planned tasks in backlog
      const planned = tasks.filter(t => t.status === 'Planned');
      return planned.slice(0, Math.ceil(planned.length / 2));
    }
    if (columnId === 'todo') {
      // Show second half of planned tasks in todo
      const planned = tasks.filter(t => t.status === 'Planned');
      return planned.slice(Math.ceil(planned.length / 2));
    }
    if (columnId === 'review') {
      // Show first half of completed in review
      const completed = tasks.filter(t => t.status === 'Completed');
      return completed.slice(0, Math.ceil(completed.length / 2));
    }
    if (columnId === 'done') {
      // Show second half of completed in done
      const completed = tasks.filter(t => t.status === 'Completed');
      return completed.slice(Math.ceil(completed.length / 2));
    }
    return tasks.filter(t => t.status === status);
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="inline-flex gap-4 min-w-full">
        {columns.map(column => {
          const columnTasks = getTasksForColumn(column.id, column.status);

          return (
            <div key={column.id} className="flex-shrink-0 w-80">
              <div className="bg-gray-100 rounded-lg p-4">
                {/* Column Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">{column.title}</h3>
                  <span className="bg-gray-200 text-gray-700 text-sm font-medium px-2 py-1 rounded-full">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Tasks */}
                <div className="space-y-3 min-h-[200px]">
                  {columnTasks.map(task => {
                    // Simple priority based on section
                    const priority = task.section.includes('Security') ? 'high' :
                                   task.section.includes('Core') ? 'medium' : 'low';

                    const priorityColor = priority === 'high' ? 'border-red-500' :
                                        priority === 'medium' ? 'border-yellow-500' : 'border-green-500';

                    return (
                      <div
                        key={task.id}
                        onClick={() => onTaskClick(task)}
                        className={`bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 ${priorityColor}`}
                      >
                        {/* Task ID */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-500">{task.id}</span>
                          <span className="text-xs text-gray-400">Sprint {task.sprint}</span>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-gray-900 mb-3">
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
                      </div>
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
