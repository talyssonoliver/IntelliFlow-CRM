'use client';

import { useState } from 'react';
import { Icon } from '@/lib/icons';

export interface FileHashEntry {
  path: string;
  hash: string;
  status: 'matched' | 'mismatched' | 'missing' | 'pending';
  size?: number;
}

export interface ContextPackData {
  taskId: string;
  runId?: string;
  packStatus: 'generated' | 'pending' | 'missing' | 'error';
  ackStatus: 'acknowledged' | 'pending' | 'missing' | 'invalid';
  hashStatus: 'valid' | 'invalid' | 'pending' | 'unchecked';
  filesRead: FileHashEntry[];
  invariantsAcknowledged?: string[];
  totalSize?: number;
  generatedAt?: string;
  acknowledgedAt?: string;
}

interface ContextPackStatusProps {
  data: ContextPackData;
  compact?: boolean;
}

const STATUS_CONFIG = {
  generated: { icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-50', label: 'Generated' },
  acknowledged: {
    icon: 'check_circle',
    color: 'text-green-600',
    bg: 'bg-green-50',
    label: 'Acknowledged',
  },
  valid: { icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-50', label: 'Valid' },
  pending: { icon: 'schedule', color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Pending' },
  missing: { icon: 'cancel', color: 'text-red-600', bg: 'bg-red-50', label: 'Missing' },
  invalid: { icon: 'warning', color: 'text-red-600', bg: 'bg-red-50', label: 'Invalid' },
  error: { icon: 'cancel', color: 'text-red-600', bg: 'bg-red-50', label: 'Error' },
  unchecked: { icon: 'schedule', color: 'text-gray-400', bg: 'bg-gray-50', label: 'Unchecked' },
  matched: { icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-50', label: 'Matched' },
  mismatched: { icon: 'warning', color: 'text-red-600', bg: 'bg-red-50', label: 'Mismatched' },
};

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
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

function shortenHash(hash: string): string {
  if (!hash || hash.length < 12) return hash || '-';
  return `${hash.slice(0, 8)}...`;
}

export default function ContextPackStatus({ data, compact = false }: ContextPackStatusProps) {
  const [expanded, setExpanded] = useState(false);

  const allValid =
    data.packStatus === 'generated' &&
    data.ackStatus === 'acknowledged' &&
    data.hashStatus === 'valid';

  const overallStatus = allValid
    ? 'valid'
    : data.packStatus === 'missing' || data.ackStatus === 'missing'
      ? 'missing'
      : 'pending';

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            overallStatus === 'valid'
              ? 'bg-green-500'
              : overallStatus === 'missing'
                ? 'bg-red-500'
                : 'bg-yellow-500'
          }`}
          title={`Context verification: ${overallStatus}`}
        />
        <span className="text-xs text-gray-500">{data.filesRead.length} files</span>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${
          allValid ? 'bg-green-50' : 'bg-gray-50'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Icon name="inventory_2" size="lg" className={allValid ? 'text-green-600' : 'text-gray-500'} />
          <span className="font-medium text-gray-900">Context Verification</span>
          <StatusBadge status={overallStatus} />
        </div>
        {expanded ? (
          <Icon name="expand_less" size="lg" className="text-gray-400" />
        ) : (
          <Icon name="expand_more" size="lg" className="text-gray-400" />
        )}
      </div>

      {/* Summary Row */}
      <div className="px-4 py-2 bg-white border-t border-gray-100 grid grid-cols-3 gap-4">
        <div className="flex items-center gap-2">
          <Icon name="inventory_2" size="sm" className="text-gray-400" />
          <span className="text-sm text-gray-600">Context Pack</span>
          <StatusBadge status={data.packStatus} />
        </div>
        <div className="flex items-center gap-2">
          <Icon name="task" size="sm" className="text-gray-400" />
          <span className="text-sm text-gray-600">Context Ack</span>
          <StatusBadge status={data.ackStatus} />
        </div>
        <div className="flex items-center gap-2">
          <Icon name="tag" size="sm" className="text-gray-400" />
          <span className="text-sm text-gray-600">Hash Match</span>
          <StatusBadge status={data.hashStatus} />
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-200">
          {/* Files Read */}
          <div className="px-4 py-3">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Files Read ({data.filesRead.length})
            </h4>
            <div className="bg-gray-50 rounded-lg p-2 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
              {data.filesRead.length === 0 ? (
                <div className="text-gray-500 italic">No files recorded</div>
              ) : (
                data.filesRead.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-100"
                  >
                    <span className="text-gray-700 truncate flex-1" title={file.path}>
                      {file.path}
                    </span>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-gray-500" title={file.hash}>
                        {shortenHash(file.hash)}
                      </span>
                      <span
                        className={`w-4 h-4 flex items-center justify-center ${
                          file.status === 'matched'
                            ? 'text-green-600'
                            : file.status === 'mismatched'
                              ? 'text-red-600'
                              : file.status === 'missing'
                                ? 'text-red-600'
                                : 'text-gray-400'
                        }`}
                      >
                        {file.status === 'matched'
                          ? '✓'
                          : file.status === 'mismatched'
                            ? '✗'
                            : file.status === 'missing'
                              ? '?'
                              : '○'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {data.totalSize && (
              <div className="text-xs text-gray-500 mt-2">
                Total size: {formatBytes(data.totalSize)}
              </div>
            )}
          </div>

          {/* Invariants */}
          {data.invariantsAcknowledged && data.invariantsAcknowledged.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Invariants Acknowledged ({data.invariantsAcknowledged.length})
              </h4>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                {data.invariantsAcknowledged.map((inv, idx) => (
                  <li key={idx}>{inv}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Timestamps */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex gap-4 text-xs text-gray-500">
            {data.generatedAt && (
              <span>Generated: {new Date(data.generatedAt).toLocaleString()}</span>
            )}
            {data.acknowledgedAt && (
              <span>Acknowledged: {new Date(data.acknowledgedAt).toLocaleString()}</span>
            )}
            {data.runId && <span>Run ID: {data.runId}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact inline indicator for task cards
export function ContextStatusIndicator({
  packStatus,
  ackStatus,
}: {
  packStatus: ContextPackData['packStatus'];
  ackStatus: ContextPackData['ackStatus'];
}) {
  const packOk = packStatus === 'generated';
  const ackOk = ackStatus === 'acknowledged';

  return (
    <div className="flex items-center gap-1 text-xs">
      <span
        className={`w-2 h-2 rounded-full ${packOk ? 'bg-green-500' : 'bg-gray-300'}`}
        title={`Pack: ${packStatus}`}
      />
      <span
        className={`w-2 h-2 rounded-full ${ackOk ? 'bg-green-500' : 'bg-gray-300'}`}
        title={`Ack: ${ackStatus}`}
      />
    </div>
  );
}
