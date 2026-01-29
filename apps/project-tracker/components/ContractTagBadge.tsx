'use client';

import { Icon, type IconName } from '@/lib/icons';

export type ContractTagType =
  | 'FILE'
  | 'DIR'
  | 'ENV'
  | 'POLICY'
  | 'EVIDENCE'
  | 'VALIDATE'
  | 'GATE'
  | 'AUDIT'
  | 'ARTIFACT';

interface ContractTagBadgeProps {
  type: ContractTagType;
  value: string;
  status?: 'valid' | 'missing' | 'pending' | 'unknown';
  compact?: boolean;
}

const TAG_CONFIG: Record<
  ContractTagType,
  { color: string; bgColor: string; icon: IconName; label: string }
> = {
  FILE: {
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
    icon: 'description',
    label: 'FILE',
  },
  DIR: {
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50 border-indigo-200',
    icon: 'folder',
    label: 'DIR',
  },
  ENV: {
    color: 'text-purple-700',
    bgColor: 'bg-purple-50 border-purple-200',
    icon: 'vpn_key',
    label: 'ENV',
  },
  POLICY: {
    color: 'text-orange-700',
    bgColor: 'bg-orange-50 border-orange-200',
    icon: 'shield',
    label: 'POLICY',
  },
  EVIDENCE: {
    color: 'text-green-700',
    bgColor: 'bg-green-50 border-green-200',
    icon: 'check_circle',
    label: 'EVIDENCE',
  },
  VALIDATE: {
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-50 border-cyan-200',
    icon: 'terminal',
    label: 'VALIDATE',
  },
  GATE: {
    color: 'text-red-700',
    bgColor: 'bg-red-50 border-red-200',
    icon: 'lock',
    label: 'GATE',
  },
  AUDIT: {
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50 border-yellow-200',
    icon: 'visibility',
    label: 'AUDIT',
  },
  ARTIFACT: {
    color: 'text-teal-700',
    bgColor: 'bg-teal-50 border-teal-200',
    icon: 'inventory_2',
    label: 'ARTIFACT',
  },
};

const STATUS_INDICATOR: Record<string, { icon: string; color: string }> = {
  valid: { icon: '✓', color: 'text-green-600' },
  missing: { icon: '✗', color: 'text-red-600' },
  pending: { icon: '○', color: 'text-yellow-600' },
  unknown: { icon: '?', color: 'text-gray-400' },
};

export default function ContractTagBadge({
  type,
  value,
  status,
  compact = false,
}: ContractTagBadgeProps) {
  const config = TAG_CONFIG[type];
  const statusConfig = status ? STATUS_INDICATOR[status] : null;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${config.bgColor} ${config.color}`}
        title={`${type}:${value}`}
      >
        <Icon name={config.icon} size="xs" />
        <span className="truncate max-w-[120px]">{value}</span>
        {statusConfig && <span className={statusConfig.color}>{statusConfig.icon}</span>}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.bgColor}`}>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded ${config.color} bg-white border ${config.bgColor}`}
      >
        <Icon name={config.icon} size="sm" />
        {config.label}
      </span>
      <span className="flex-1 text-sm font-mono text-gray-700 truncate">{value}</span>
      {statusConfig && (
        <span className={`text-sm font-medium ${statusConfig.color}`} title={status}>
          {statusConfig.icon}
        </span>
      )}
    </div>
  );
}

// Summary badge for compact display (shows count per type)
export function ContractTagSummary({ tags }: { tags: { type: ContractTagType; count: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(({ type, count }) => {
        const config = TAG_CONFIG[type];
        return (
          <span
            key={type}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded border ${config.bgColor} ${config.color}`}
            title={`${count} ${type} tags`}
          >
            <Icon name={config.icon} size="xs" />
            <span>{count}</span>
          </span>
        );
      })}
    </div>
  );
}
