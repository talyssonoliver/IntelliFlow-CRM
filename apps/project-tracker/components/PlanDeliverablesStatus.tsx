'use client';

import { useState } from 'react';
import { Icon } from '@/lib/icons';
import type { PlanDeliverablesVerification, PlanCheckboxItem } from '@/lib/types';

interface PlanDeliverablesStatusProps {
  data: PlanDeliverablesVerification | null;
  compact?: boolean;
}

const STATUS_CONFIG = {
  exists: { icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-50', label: 'Exists' },
  deleted: { icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-50', label: 'Deleted' },
  missing: { icon: 'cancel', color: 'text-red-600', bg: 'bg-red-50', label: 'Missing' },
  unknown: { icon: 'help', color: 'text-gray-400', bg: 'bg-gray-50', label: 'Unknown' },
  complete: { icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-50', label: 'Complete' },
  partial: { icon: 'pending', color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Partial' },
  incomplete: { icon: 'cancel', color: 'text-red-600', bg: 'bg-red-50', label: 'Incomplete' },
  'no-plan': { icon: 'description', color: 'text-gray-400', bg: 'bg-gray-50', label: 'No Plan' },
};

function StatusBadge({ status }: Readonly<{ status: keyof typeof STATUS_CONFIG }>) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${config.bg} ${config.color}`}
    >
      <Icon name={config.icon} size="xs" />
      {config.label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProgressBar({ percentage, color }: Readonly<{ percentage: number; color: string }>) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-300 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
      />
    </div>
  );
}

function getOverallColor(status: string): string {
  if (status === 'complete') return 'bg-green-500';
  if (status === 'partial') return 'bg-yellow-500';
  if (status === 'no-plan') return 'bg-gray-300';
  return 'bg-red-500';
}

function getProgressBarColor(percentage: number): string {
  if (percentage === 100) return 'bg-green-500';
  if (percentage >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function isFilePresent(status: string): boolean {
  return status === 'exists' || status === 'deleted';
}

function groupCheckboxesByPhase(items: PlanCheckboxItem[]): Record<string, PlanCheckboxItem[]> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.phase]) acc[item.phase] = [];
      acc[item.phase].push(item);
      return acc;
    },
    {} as Record<string, PlanCheckboxItem[]>
  );
}

interface DeliverablesSectionProps {
  data: PlanDeliverablesVerification;
  expanded: boolean;
  onToggle: () => void;
}

function DeliverablesSection({ data, expanded, onToggle }: Readonly<DeliverablesSectionProps>) {
  if (data.deliverables.total === 0) return null;
  return (
    <div className="border-t border-gray-200">
      <button
        type="button"
        className="w-full px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <h4 className="text-sm font-medium text-gray-700">
          Plan Deliverables ({data.deliverables.total})
        </h4>
        {expanded ? (
          <Icon name="expand_less" size="sm" className="text-gray-400" />
        ) : (
          <Icon name="expand_more" size="sm" className="text-gray-400" />
        )}
      </button>
      {expanded ? (
        <div className="px-4 pb-3">
          <div className="bg-gray-50 rounded-lg p-2 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
            {data.deliverables.items.map((file, idx) => {
              const present = isFilePresent(file.status);
              return (
                <div
                  key={file.path}
                  className={`flex items-center justify-between py-1 px-2 rounded ${present ? 'bg-green-50' : 'bg-red-50'}`}
                >
                  <span
                    className={`truncate flex-1 ${present ? 'text-gray-700' : 'text-red-700'}`}
                    title={file.path}
                  >
                    {file.path}
                    {file.status === 'deleted' ? ' (deleted)' : ''}
                  </span>
                  <div className="flex items-center gap-2 ml-2">
                    {file.size ? (
                      <span className="text-gray-500 text-[10px]">{formatBytes(file.size)}</span>
                    ) : null}
                    <span
                      className={`w-4 h-4 flex items-center justify-center ${present ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {present ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface CheckboxesSectionProps {
  data: PlanDeliverablesVerification;
  expanded: boolean;
  onToggle: () => void;
}

function CheckboxesSection({ data, expanded, onToggle }: Readonly<CheckboxesSectionProps>) {
  if (data.checkboxes.total === 0) return null;
  return (
    <div className="border-t border-gray-200">
      <button
        type="button"
        className="w-full px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <h4 className="text-sm font-medium text-gray-700">
          Implementation Steps ({data.checkboxes.total})
        </h4>
        {expanded ? (
          <Icon name="expand_less" size="sm" className="text-gray-400" />
        ) : (
          <Icon name="expand_more" size="sm" className="text-gray-400" />
        )}
      </button>
      {expanded ? (
        <div className="px-4 pb-3">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Object.entries(groupCheckboxesByPhase(data.checkboxes.items)).map(
              ([phase, items]) => (
                <div key={phase} className="bg-gray-50 rounded-lg p-2">
                  <h5 className="text-xs font-medium text-gray-600 mb-1">{phase}</h5>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div key={item.text} className="flex items-start gap-2 text-xs">
                        <span
                          className={`mt-0.5 ${item.checked ? 'text-green-600' : 'text-gray-400'}`}
                        >
                          {item.checked ? '☑' : '☐'}
                        </span>
                        <span
                          className={`${item.checked ? 'text-gray-700 line-through' : 'text-gray-900'}`}
                        >
                          {item.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PlanDeliverablesStatus({
  data,
  compact = false,
}: Readonly<PlanDeliverablesStatusProps>) {
  const [expandedFiles, setExpandedFiles] = useState(false);
  const [expandedCheckboxes, setExpandedCheckboxes] = useState(false);

  if (!data) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-center text-gray-500">
        <Icon name="description" size="lg" className="mx-auto mb-2" />
        <p className="text-sm">No plan verification data available</p>
      </div>
    );
  }

  const overallColor = getOverallColor(data.overallStatus);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${overallColor}`}
          title={`Plan verification: ${data.overallStatus} (${data.completionPercentage}%)`}
        />
        <span className="text-xs text-gray-500">
          {data.deliverables.verified}/{data.deliverables.total} files, {data.checkboxes.checked}/
          {data.checkboxes.total} steps
        </span>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className={`px-4 py-3 flex items-center justify-between ${
          data.overallStatus === 'complete' ? 'bg-green-50' : 'bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <Icon
            name="checklist"
            size="lg"
            className={data.overallStatus === 'complete' ? 'text-green-600' : 'text-gray-500'}
          />
          <span className="font-medium text-gray-900">Plan Deliverables Verification</span>
          <StatusBadge status={data.overallStatus} />
        </div>
        <span className="text-sm font-medium text-gray-600">{data.completionPercentage}%</span>
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-2 bg-white border-t border-gray-100">
        <ProgressBar
          percentage={data.completionPercentage}
          color={getProgressBarColor(data.completionPercentage)}
        />
      </div>

      {/* Summary Row */}
      <div className="px-4 py-2 bg-white border-t border-gray-100 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <Icon name="folder" size="sm" className="text-gray-400" />
          <span className="text-sm text-gray-600">Files</span>
          <span className="text-sm font-medium">
            {data.deliverables.verified}/{data.deliverables.total}
          </span>
          {data.deliverables.missing > 0 ? (
            <span className="text-xs text-red-600">({data.deliverables.missing} missing)</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Icon name="check_box" size="sm" className="text-gray-400" />
          <span className="text-sm text-gray-600">Steps</span>
          <span className="text-sm font-medium">
            {data.checkboxes.checked}/{data.checkboxes.total}
          </span>
          {data.checkboxes.unchecked > 0 ? (
            <span className="text-xs text-yellow-600">({data.checkboxes.unchecked} unchecked)</span>
          ) : null}
        </div>
      </div>

      {/* Deliverables Section */}
      <DeliverablesSection
        data={data}
        expanded={expandedFiles}
        onToggle={() => setExpandedFiles(!expandedFiles)}
      />

      {/* Checkboxes Section */}
      <CheckboxesSection
        data={data}
        expanded={expandedCheckboxes}
        onToggle={() => setExpandedCheckboxes(!expandedCheckboxes)}
      />

      {/* Plan Path */}
      {data.planPath ? (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
          Plan: {data.planPath}
        </div>
      ) : null}
    </div>
  );
}

// Compact inline indicator for task cards
function _PlanVerificationIndicator({
  overallStatus,
  completionPercentage,
}: Readonly<{
  overallStatus: PlanDeliverablesVerification['overallStatus'];
  completionPercentage: number;
}>) {
  const noPlanOrFailIndicatorColor = overallStatus === 'no-plan' ? 'bg-gray-300' : 'bg-red-500';
  const partialOrLowerIndicatorColor =
    overallStatus === 'partial' ? 'bg-yellow-500' : noPlanOrFailIndicatorColor;
  const color = overallStatus === 'complete' ? 'bg-green-500' : partialOrLowerIndicatorColor;

  return (
    <div
      className="flex items-center gap-1 text-xs"
      title={`Plan verification: ${completionPercentage}%`}
    >
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-gray-500">{completionPercentage}%</span>
    </div>
  );
}
