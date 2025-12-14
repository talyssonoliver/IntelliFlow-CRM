'use client';

import { Task } from '@/lib/types';
import { countTasksByStatus } from '@/lib/csv-parser';
import { groupBy } from '@/lib/utils';

interface AnalyticsViewProps {
  tasks: Task[];
  sections: string[];
}

export default function AnalyticsView({ tasks, sections }: AnalyticsViewProps) {
  const stats = countTasksByStatus(tasks);
  const tasksBySection = groupBy(tasks, 'section');

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>

      {/* Status Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600 mb-2">Planned</p>
            <p className="text-4xl font-bold text-gray-700">{stats.planned}</p>
            <p className="text-xs text-gray-500 mt-2">
              {((stats.planned / stats.total) * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600 mb-2">In Progress</p>
            <p className="text-4xl font-bold text-blue-600">{stats.inProgress}</p>
            <p className="text-xs text-gray-500 mt-2">
              {((stats.inProgress / stats.total) * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600 mb-2">Completed</p>
            <p className="text-4xl font-bold text-green-600">{stats.completed}</p>
            <p className="text-xs text-gray-500 mt-2">
              {((stats.completed / stats.total) * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600 mb-2">Blocked</p>
            <p className="text-4xl font-bold text-red-600">{stats.blocked}</p>
            <p className="text-xs text-gray-500 mt-2">
              {stats.total > 0 ? ((stats.blocked / stats.total) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
      </div>

      {/* Section Analysis */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Tasks by Section</h3>
        <div className="space-y-4">
          {sections.map(section => {
            const sectionTasks = tasksBySection[section] || [];
            const sectionStats = countTasksByStatus(sectionTasks);

            return (
              <div key={section} className="border-b border-gray-200 pb-4 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">{section}</h4>
                  <span className="text-sm text-gray-500">{sectionTasks.length} tasks</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-xs text-gray-500">Planned</p>
                    <p className="text-lg font-semibold text-gray-700">{sectionStats.planned}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">In Progress</p>
                    <p className="text-lg font-semibold text-blue-600">{sectionStats.inProgress}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Completed</p>
                    <p className="text-lg font-semibold text-green-600">{sectionStats.completed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Blocked</p>
                    <p className="text-lg font-semibold text-red-600">{sectionStats.blocked}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
