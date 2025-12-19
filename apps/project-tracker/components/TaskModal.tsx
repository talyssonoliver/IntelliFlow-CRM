'use client';

import { Task } from '@/lib/types';
import { X } from 'lucide-react';

interface TaskModalProps {
  task: Task;
  onClose: () => void;
}

export default function TaskModal({ task, onClose }: TaskModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">{task.id}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
            <p className="text-gray-900">{task.description}</p>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Owner</h3>
              <p className="text-gray-900">{task.owner}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Sprint</h3>
              <p className="text-gray-900">{task.sprint}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
              <span
                className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${
                  task.status === 'Completed'
                    ? 'bg-green-100 text-green-800'
                    : task.status === 'In Progress'
                      ? 'bg-blue-100 text-blue-800'
                      : task.status === 'Blocked'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                }`}
              >
                {task.status}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Section</h3>
              <p className="text-gray-900">{task.section}</p>
            </div>
          </div>

          {/* Prerequisites */}
          {task.prerequisites && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Prerequisites</h3>
              <p className="text-gray-900">{task.prerequisites}</p>
            </div>
          )}

          {/* Definition of Done */}
          {task.dod && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Definition of Done</h3>
              <p className="text-gray-900 whitespace-pre-wrap">{task.dod}</p>
            </div>
          )}

          {/* KPIs */}
          {task.kpis && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">KPIs</h3>
              <p className="text-gray-900">{task.kpis}</p>
            </div>
          )}

          {/* Dependencies */}
          {task.dependencies.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Dependencies</h3>
              <div className="flex flex-wrap gap-2">
                {task.dependencies.map((dep) => (
                  <span key={dep} className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Artifacts */}
          {task.artifacts.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Artifacts</h3>
              <div className="bg-gray-50 rounded p-3 font-mono text-sm space-y-1">
                {task.artifacts.map((artifact, i) => (
                  <div key={i} className="text-gray-700">
                    {artifact}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation Method */}
          {task.validation && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Validation Method</h3>
              <p className="text-gray-900">{task.validation}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
