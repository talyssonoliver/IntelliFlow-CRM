'use client';

import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Shield,
  Sparkles,
} from 'lucide-react';

export type GateStatus = 'passed' | 'failed' | 'warning' | 'pending' | 'skipped';

export interface GateResult {
  id: number;
  name: string;
  description: string;
  status: GateStatus;
  tasksChecked: number;
  tasksPassed: number;
  details?: string;
  isNew?: boolean;
  isExtended?: boolean;
}

interface GateValidationTableProps {
  readonly gates: GateResult[];
  readonly sprint: number | string;
  readonly onGateClick?: (gate: GateResult) => void;
}

const STATUS_CONFIG: Record<
  GateStatus,
  { icon: typeof CheckCircle; color: string; bgColor: string; label: string }
> = {
  passed: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    label: 'PASS',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'FAIL',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    label: 'WARN',
  },
  pending: {
    icon: Clock,
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    label: 'PENDING',
  },
  skipped: {
    icon: Clock,
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    label: 'SKIPPED',
  },
};

function GateStatusBadge({ status }: Readonly<{ status: GateStatus }>) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${config.bgColor} ${config.color}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

export default function GateValidationTable({
  gates,
  sprint,
  onGateClick,
}: GateValidationTableProps) {
  const [expandedGate, setExpandedGate] = useState<number | null>(null);

  const passedCount = gates.filter((g) => g.status === 'passed').length;
  const warnCount = gates.filter((g) => g.status === 'warning').length;
  const failedCount = gates.filter((g) => g.status === 'failed').length;

  const toggleExpand = (gateId: number) => {
    setExpandedGate(expandedGate === gateId ? null : gateId);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-gray-600" />
          <h3 className="font-medium text-gray-900">Validation Gates</h3>
          <span className="text-sm text-gray-500">Sprint {sprint}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle className="w-4 h-4" />
            {passedCount} PASS
          </span>
          {warnCount > 0 && (
            <span className="flex items-center gap-1 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              {warnCount} WARN
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="w-4 h-4" />
              {failedCount} FAIL
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <table className="w-full">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-2 text-left w-16">Gate</th>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-center w-24">Status</th>
            <th className="px-4 py-2 text-center w-24">Tasks</th>
            <th className="px-4 py-2 text-center w-12"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {gates.map((gate) => (
            <React.Fragment key={gate.id}>
              <tr
                className={`hover:bg-gray-50 cursor-pointer ${
                  expandedGate === gate.id ? 'bg-gray-50' : ''
                }`}
                onClick={() => {
                  toggleExpand(gate.id);
                  onGateClick?.(gate);
                }}
              >
                <td className="px-4 py-3 text-sm font-mono text-gray-600">{gate.id}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{gate.name}</span>
                    {gate.isNew && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                        <Sparkles className="w-3 h-3" />
                        NEW
                      </span>
                    )}
                    {gate.isExtended && (
                      <span className="px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                        EXTENDED
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <GateStatusBadge status={gate.status} />
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">
                  {gate.tasksPassed}/{gate.tasksChecked}
                </td>
                <td className="px-4 py-3 text-center">
                  {expandedGate === gate.id ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </td>
              </tr>
              {expandedGate === gate.id && (
                <tr key={`${gate.id}-details`}>
                  <td colSpan={5} className="px-4 py-3 bg-gray-50">
                    <div className="text-sm">
                      <p className="text-gray-600 mb-2">{gate.description}</p>
                      {gate.details && (
                        <div className="bg-white border border-gray-200 rounded p-3 font-mono text-xs text-gray-700 whitespace-pre-wrap">
                          {gate.details}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {/* Summary Footer */}
      <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 text-xs text-gray-500">
        Total: {gates.length} gates |{' '}
        {passedCount === gates.length
          ? 'All gates passing'
          : `${gates.length - passedCount} gates need attention`}
      </div>
    </div>
  );
}

// Default gates data for Sprint 0 (can be fetched from API)
export const DEFAULT_GATES: GateResult[] = [
  {
    id: 0,
    name: 'Sprint Start Gate',
    description: 'Verifies prerequisite sprints are complete before starting',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
  },
  {
    id: 1,
    name: 'Baseline Structure',
    description: 'Validates project structure and required files exist',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
  },
  {
    id: 2,
    name: 'Sprint Completion',
    description: 'Checks CSV status column for completed tasks',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
  },
  {
    id: 3,
    name: 'Evidence Integrity',
    description: 'Validates task JSON semantics and evidence files',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
    isExtended: true,
    details:
      'Extended: Now includes context_pack + context_ack validation for In Progress/Completed tasks',
  },
  {
    id: 4,
    name: 'Docs Hygiene',
    description: 'Ensures no runtime artifacts in docs directory',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
  },
  {
    id: 5,
    name: 'Metrics Tracked State',
    description: 'Verifies no untracked metric files',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
  },
  {
    id: 6,
    name: 'Canonical Uniqueness',
    description: 'Ensures single source of truth for Sprint_plan.csv',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
  },
  {
    id: 7,
    name: 'Root-Level Artifact Containment',
    description: 'Validates artifacts are in proper directories',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
  },
  {
    id: 8,
    name: 'Audit Matrix Waivers',
    description: 'Validates waiver files for disabled security tools',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
  },
  {
    id: 9,
    name: 'Contract Tag Parser',
    description:
      'Validates FILE:, DIR:, ENV:, POLICY: tags in Pre-requisites; EVIDENCE: tags in Artifacts; VALIDATE:, GATE:, AUDIT: tags in Validation Method',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
    isNew: true,
    details:
      'Applies NOELLIPSIS rule to all contract fields\n- Pre-requisites: FILE:, DIR:, ENV:, POLICY:\n- Artifacts To Track: EVIDENCE:\n- Validation Method: VALIDATE:, GATE:, AUDIT:',
  },
  {
    id: 10,
    name: 'Context Ack Gate',
    description:
      'Verifies context_ack.json exists for tasks with EVIDENCE:context_ack, validates SHA256 hashes match manifest',
    status: 'passed',
    tasksChecked: 34,
    tasksPassed: 34,
    isNew: true,
    details:
      '- Verifies context_ack.json exists for tasks with EVIDENCE:context_ack\n- Validates SHA256 hashes match context_pack.manifest.json\n- Confirms all FILE: prerequisites are acknowledged',
  },
];

// Compact version for dashboard
export function GateValidationSummary({
  gates,
}: Readonly<{
  gates: GateResult[];
}>) {
  const passedCount = gates.filter((g) => g.status === 'passed').length;
  const totalCount = gates.length;
  const allPassed = passedCount === totalCount;

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${allPassed ? 'bg-green-500' : 'bg-yellow-500'}`} />
      <span className="text-sm font-medium">
        {passedCount}/{totalCount} Gates
      </span>
      {allPassed ? (
        <span className="text-xs text-green-600">All Passing</span>
      ) : (
        <span className="text-xs text-yellow-600">{totalCount - passedCount} Need Attention</span>
      )}
    </div>
  );
}
