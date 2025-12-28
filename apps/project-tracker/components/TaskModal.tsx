'use client';

import { useState, useEffect } from 'react';
import { Task } from '@/lib/types';
import { X, RefreshCw } from 'lucide-react';
import ContractTagList, { parseContractTags, hasContractTags } from './ContractTagList';
import ContextPackStatus, { ContextPackData } from './ContextPackStatus';

interface TaskModalProps {
  task: Task;
  onClose: () => void;
}

export default function TaskModal({ task, onClose }: TaskModalProps) {
  const [contextData, setContextData] = useState<ContextPackData | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'contract' | 'context'>('details');

  // Check if task has contract tags
  const hasPrereqTags = hasContractTags(task.prerequisites);
  const hasArtifactTags = task.artifacts.some((a) => hasContractTags(a));
  const hasValidationTags = hasContractTags(task.validation);
  const hasAnyContractTags = hasPrereqTags || hasArtifactTags || hasValidationTags;

  // Parse artifacts string (joined with ;)
  const artifactsString = task.artifacts.join(';');
  const requiresContextAck = parseContractTags(artifactsString).some(
    (t) => t.type === 'EVIDENCE' && t.value === 'context_ack'
  );

  // Load context status when contract tab is selected
  useEffect(() => {
    if (activeTab === 'context' && !contextData && !loadingContext) {
      setLoadingContext(true);
      fetch(`/api/context/${task.id}`)
        .then((res) => res.json())
        .then((data) => {
          setContextData(data);
          setLoadingContext(false);
        })
        .catch(() => {
          setLoadingContext(false);
        });
    }
  }, [activeTab, task.id, contextData, loadingContext]);

  const refreshContext = () => {
    setLoadingContext(true);
    setContextData(null);
    fetch(`/api/context/${task.id}`)
      .then((res) => res.json())
      .then((data) => {
        setContextData(data);
        setLoadingContext(false);
      })
      .catch(() => {
        setLoadingContext(false);
      });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
      <button
        type="button"
        aria-label="Close modal"
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">{task.id}</h2>
            {hasAnyContractTags && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                Contract Tags
              </span>
            )}
            {requiresContextAck && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                Requires ACK
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex gap-4" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'details'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('contract')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'contract'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Contract Tags
              {hasAnyContractTags && <span className="w-2 h-2 bg-green-500 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab('context')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'context'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Context Verification
              {requiresContextAck && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-6">
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
                      <span
                        key={dep}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded"
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contract Tags Tab */}
          {activeTab === 'contract' && (
            <div className="space-y-6">
              {/* Prerequisites */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                  Pre-requisites
                  {hasPrereqTags && (
                    <span className="text-xs text-green-600">
                      ({parseContractTags(task.prerequisites).length} tags)
                    </span>
                  )}
                </h3>
                {hasPrereqTags ? (
                  <ContractTagList rawString={task.prerequisites} mode="full" />
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                    No contract tags found. Raw value:{' '}
                    <span className="font-mono">{task.prerequisites || '(empty)'}</span>
                  </div>
                )}
              </div>

              {/* Artifacts */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                  Artifacts To Track (Evidence)
                  {hasArtifactTags && (
                    <span className="text-xs text-green-600">
                      ({parseContractTags(artifactsString).length} tags)
                    </span>
                  )}
                </h3>
                {hasArtifactTags ? (
                  <ContractTagList rawString={artifactsString} mode="full" />
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                    No EVIDENCE tags found. Raw artifacts:
                    <ul className="mt-2 font-mono text-xs space-y-1">
                      {task.artifacts.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Validation */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                  Validation Method
                  {hasValidationTags && (
                    <span className="text-xs text-green-600">
                      ({parseContractTags(task.validation).length} tags)
                    </span>
                  )}
                </h3>
                {hasValidationTags ? (
                  <ContractTagList rawString={task.validation} mode="full" />
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                    No contract tags found. Raw value:{' '}
                    <span className="font-mono">{task.validation || '(empty)'}</span>
                  </div>
                )}
              </div>

              {/* Compliance Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Contract Compliance</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div
                      className={`text-2xl font-bold ${
                        hasPrereqTags ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {hasPrereqTags ? '✓' : '○'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Prerequisites</div>
                  </div>
                  <div>
                    <div
                      className={`text-2xl font-bold ${
                        hasArtifactTags ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {hasArtifactTags ? '✓' : '○'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Evidence</div>
                  </div>
                  <div>
                    <div
                      className={`text-2xl font-bold ${
                        hasValidationTags ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {hasValidationTags ? '✓' : '○'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Validation</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Context Tab */}
          {activeTab === 'context' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
                  Context Pack & Acknowledgment Status
                </h3>
                <button
                  onClick={refreshContext}
                  disabled={loadingContext}
                  className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingContext ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {loadingContext ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : contextData ? (
                <ContextPackStatus data={contextData} />
              ) : (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <p className="text-gray-500">No context pack data available for this task.</p>
                  {requiresContextAck && (
                    <p className="text-sm text-yellow-600 mt-2">
                      This task requires context_ack but none has been generated yet.
                    </p>
                  )}
                </div>
              )}

              {/* Requirements */}
              {requiresContextAck && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">
                    Context Acknowledgment Required
                  </h4>
                  <p className="text-sm text-blue-700">
                    This task has{' '}
                    <code className="bg-blue-100 px-1 rounded">EVIDENCE:context_ack</code> in its
                    artifacts. The agent must produce a valid context_ack.json with SHA256 hashes
                    matching all FILE: prerequisites before code changes are accepted.
                  </p>
                </div>
              )}
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
