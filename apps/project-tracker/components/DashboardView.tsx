'use client';

import { Task } from '@/lib/types';
import { countTasksByStatus, calculateCompletionRate } from '@/lib/csv-parser';
import { groupBy } from '@/lib/utils';
import React from 'react';
import { Clock, CheckCircle2, PlayCircle } from 'lucide-react';
import ExecutiveSummary from './ExecutiveSummary';
import SwarmMonitor from './SwarmMonitor';

interface DashboardViewProps {
  readonly tasks: Task[];
  readonly sections: string[];
  readonly onTaskClick: (task: Task) => void;
}

export default function DashboardView({ tasks, sections, onTaskClick }: DashboardViewProps) {
  const stats = countTasksByStatus(tasks);
  const completionRate = calculateCompletionRate(tasks);
  const tasksBySection = groupBy(tasks, 'section');

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Tasks</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Progress</p>
              <p className="text-3xl font-bold text-blue-600">{stats.inProgress}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <PlayCircle className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Planned</p>
              <p className="text-3xl font-bold text-gray-600">{stats.planned}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">Overall Progress</h3>
          <span className="text-2xl font-bold text-blue-600">{completionRate}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-4 rounded-full transition-all duration-500"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>

      {/* Executive Summary */}
      <ExecutiveSummary />

      {/* Swarm Monitor */}
      <SwarmMonitor />

      {/* Section Breakdown */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Tasks by Section</h3>
        <div className="space-y-4">
          {sections.map((section) => {
            const sectionTasks = tasksBySection[section] || [];
            const sectionStats = countTasksByStatus(sectionTasks);
            const sectionCompletion = calculateCompletionRate(sectionTasks);

            return (
              <div key={section}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">{section}</span>
                  <span className="text-sm text-gray-500">
                    {sectionStats.completed}/{sectionStats.total} ({sectionCompletion}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${sectionCompletion}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Tasks</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tasks.slice(0, 10).map((task) => (
                <tr
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-medium text-blue-600">{task.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">
                      {task.description.substring(0, 60)}...
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-600">{task.owner}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${(() => {
                        if (task.status === 'Completed' || task.status === 'Done')
                          return 'bg-green-100 text-green-800';
                        if (task.status === 'In Progress' || task.status === 'Validating')
                          return 'bg-blue-100 text-blue-800';
                        if (task.status === 'Blocked') return 'bg-red-100 text-red-800';
                        if (task.status === 'Failed') return 'bg-red-200 text-red-900';
                        if (task.status === 'Needs Human') return 'bg-orange-100 text-orange-800';
                        if (task.status === 'In Review') return 'bg-purple-100 text-purple-800';
                        return 'bg-gray-100 text-gray-800';
                      })()}`}
                    >
                      {task.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
