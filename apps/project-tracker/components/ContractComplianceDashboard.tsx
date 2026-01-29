'use client';

import { useMemo } from 'react';
import { Task } from '@/lib/types';
import { Icon } from '@/lib/icons';
import { parseContractTags, hasContractTags } from './ContractTagList';

interface ContractComplianceDashboardProps {
  tasks: Task[];
  sprint?: number | string;
}

interface ComplianceStats {
  totalTasks: number;
  prereqsTagged: number;
  evidenceTagged: number;
  validationTagged: number;
  requiresContextAck: number;
  hasContextAck: number;
  noEllipsis: number;
  fullyCompliant: number;
}

function calculateComplianceStats(tasks: Task[]): ComplianceStats {
  let prereqsTagged = 0;
  let evidenceTagged = 0;
  let validationTagged = 0;
  let requiresContextAck = 0;
  let noEllipsis = 0;
  let fullyCompliant = 0;

  tasks.forEach((task) => {
    const hasPrereq = hasContractTags(task.prerequisites);
    const artifactsString = task.artifacts.join(';');
    const hasEvidence = hasContractTags(artifactsString);
    const hasValidation = hasContractTags(task.validation);

    if (hasPrereq) prereqsTagged++;
    if (hasEvidence) evidenceTagged++;
    if (hasValidation) validationTagged++;

    const artifactTags = parseContractTags(artifactsString);
    const needsAck = artifactTags.some((t) => t.type === 'EVIDENCE' && t.value === 'context_ack');
    if (needsAck) requiresContextAck++;

    const hasEllipsisInContract =
      task.prerequisites?.includes('...') ||
      artifactsString.includes('...') ||
      task.validation?.includes('...');

    if (!hasEllipsisInContract) noEllipsis++;

    if (hasPrereq && hasEvidence && hasValidation && !hasEllipsisInContract) {
      fullyCompliant++;
    }
  });

  return {
    totalTasks: tasks.length,
    prereqsTagged,
    evidenceTagged,
    validationTagged,
    requiresContextAck,
    hasContextAck: 0, // Would need to check actual context_ack files
    noEllipsis,
    fullyCompliant,
  };
}

function ProgressBar({
  value,
  max,
  color = 'blue',
}: {
  value: number;
  max: number;
  color?: 'blue' | 'green' | 'cyan';
}) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  const colorClass =
    color === 'green' ? 'bg-green-500' : color === 'cyan' ? 'bg-cyan-500' : 'bg-blue-500';

  return (
    <div className="w-full">
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1">{percentage}% Tagged</div>
    </div>
  );
}

export default function ContractComplianceDashboard({
  tasks,
  sprint,
}: ContractComplianceDashboardProps) {
  const stats = useMemo(() => calculateComplianceStats(tasks), [tasks]);

  const tasksMissingAck = useMemo(() => {
    return tasks.filter((task) => {
      const artifactTags = parseContractTags(task.artifacts.join(';'));
      const needsAck = artifactTags.some((t) => t.type === 'EVIDENCE' && t.value === 'context_ack');
      // For now, assume backlog tasks don't have ack yet
      return needsAck && task.status === 'Backlog';
    });
  }, [tasks]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="bar_chart" size="lg" className="text-gray-600" />
          <h3 className="font-medium text-gray-900">Contract Compliance Overview</h3>
        </div>
        {sprint !== undefined && <span className="text-sm text-gray-500">Sprint {sprint}</span>}
      </div>

      {/* Progress Bars Section */}
      <div className="p-4 border-b border-gray-100">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Pre-requisites</span>
              <span className="text-sm text-gray-500">
                {stats.prereqsTagged}/{stats.totalTasks}
              </span>
            </div>
            <ProgressBar value={stats.prereqsTagged} max={stats.totalTasks} color="blue" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Evidence</span>
              <span className="text-sm text-gray-500">
                {stats.evidenceTagged}/{stats.totalTasks}
              </span>
            </div>
            <ProgressBar value={stats.evidenceTagged} max={stats.totalTasks} color="green" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Validation</span>
              <span className="text-sm text-gray-500">
                {stats.validationTagged}/{stats.totalTasks}
              </span>
            </div>
            <ProgressBar value={stats.validationTagged} max={stats.totalTasks} color="cyan" />
          </div>
        </div>
      </div>

      {/* NOELLIPSIS Compliance */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">NOELLIPSIS Compliance:</span>
          <span className="font-medium">
            {stats.noEllipsis}/{stats.totalTasks} tasks
          </span>
          <span className="text-sm text-gray-500">
            ({Math.round((stats.noEllipsis / stats.totalTasks) * 100)}%)
          </span>
        </div>
        {stats.noEllipsis === stats.totalTasks ? (
          <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
            <Icon name="check_circle" size="sm" />
            Compliant
          </span>
        ) : (
          <span className="flex items-center gap-1 text-yellow-600 text-sm font-medium">
            <Icon name="warning" size="sm" />
            {stats.totalTasks - stats.noEllipsis} with ellipsis
          </span>
        )}
      </div>

      {/* Tasks Missing Context Ack */}
      {tasksMissingAck.length > 0 && (
        <div className="px-4 py-3">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Tasks Missing Context Ack ({tasksMissingAck.length})
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {tasksMissingAck.slice(0, 10).map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-sm text-gray-600">
                <Icon name="description" size="xs" className="text-gray-400" />
                <span className="font-mono">{task.id}</span>
                <span className="text-gray-400">({task.status})</span>
                <span className="text-gray-500 truncate">- {task.description.slice(0, 40)}...</span>
              </div>
            ))}
            {tasksMissingAck.length > 10 && (
              <div className="text-xs text-gray-400">
                ... and {tasksMissingAck.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Footer */}
      <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
        <span>
          Fully Compliant: {stats.fullyCompliant}/{stats.totalTasks} tasks
        </span>
        <span>Requires Context Ack: {stats.requiresContextAck} tasks</span>
      </div>
    </div>
  );
}
