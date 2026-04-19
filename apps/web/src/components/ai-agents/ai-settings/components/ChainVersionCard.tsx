'use client';

/**
 * Chain Version Card Component
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Displays a single chain version with status badge and actions.
 * Status badges:
 * - DRAFT: Gray with Pencil icon
 * - ACTIVE: Green with CheckCircle icon
 * - DEPRECATED: Yellow with Clock icon
 * - ARCHIVED: Faded gray with Archive icon
 */

import { Card, Button, Badge } from '@intelliflow/ui';
import type { ChainVersionStatus, ChainType } from '@intelliflow/domain';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

export interface ChainVersionCardProps {
  id: string;
  chainType: ChainType;
  status: ChainVersionStatus;
  model: string;
  description?: string | null;
  createdAt: Date | string;
  createdBy: string;
  onActivate?: (id: string) => void;
  onDeprecate?: (id: string) => void;
  onArchive?: (id: string) => void;
  onEdit?: (id: string) => void;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
  isLoading?: boolean;
}

// Status configuration
const STATUS_CONFIG: Record<
  ChainVersionStatus,
  {
    color: string;
    bgColor: string;
    icon: string;
    label: string;
  }
> = {
  DRAFT: {
    color: 'text-gray-700 dark:text-gray-300',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    icon: '✏️',
    label: 'Draft',
  },
  ACTIVE: {
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    icon: '✅',
    label: 'Active',
  },
  DEPRECATED: {
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    icon: '⏳',
    label: 'Deprecated',
  },
  ARCHIVED: {
    color: 'text-gray-500 dark:text-gray-500',
    bgColor: 'bg-gray-50 dark:bg-gray-900/50',
    icon: '📦',
    label: 'Archived',
  },
};

// Chain type labels
const CHAIN_TYPE_LABELS: Record<ChainType, string> = {
  SCORING: 'Lead Scoring',
  QUALIFICATION: 'Lead Qualification',
  EMAIL_WRITER: 'Email Writer',
  FOLLOWUP: 'Follow-up',
};

export function ChainVersionCard({
  id,
  chainType,
  status,
  model,
  description,
  createdAt,
  createdBy,
  onActivate,
  onDeprecate,
  onArchive,
  onEdit,
  onSelect,
  isSelected = false,
  isLoading = false,
}: Readonly<ChainVersionCardProps>) {
  const { timezone } = useTimezoneContext();
  const statusConfig = STATUS_CONFIG[status];
  const chainLabel = CHAIN_TYPE_LABELS[chainType];
  const dateStr =
    typeof createdAt === 'string'
      ? createdAt
      : createdAt.toLocaleDateString('en-GB', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: timezone,
        });

  const canActivate = status === 'DRAFT';
  const canDeprecate = status === 'ACTIVE';
  const canArchive = status === 'DEPRECATED';
  const canEdit = status === 'DRAFT';

  return (
    <Card
      className={`p-4 transition-all cursor-pointer hover:border-primary/50 ${
        isSelected ? 'border-primary ring-1 ring-primary' : ''
      }`}
      onClick={() => onSelect?.(id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(id);
        }
      }}
      aria-pressed={isSelected}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-foreground truncate">{chainLabel}</h4>
            <Badge
              variant="outline"
              className={`${statusConfig.bgColor} ${statusConfig.color} text-xs`}
            >
              <span className="mr-1">{statusConfig.icon}</span>
              {statusConfig.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate">{id.slice(0, 8)}...</p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm">
          <span className="text-muted-foreground w-16">Model:</span>
          <span className="font-medium text-foreground truncate">{model}</span>
        </div>
        {description && (
          <div className="flex items-start text-sm">
            <span className="text-muted-foreground w-16 shrink-0">Desc:</span>
            <span className="text-foreground line-clamp-2">{description}</span>
          </div>
        )}
        <div className="flex items-center text-sm">
          <span className="text-muted-foreground w-16">Created:</span>
          <span className="text-foreground">{dateStr}</span>
        </div>
        <div className="flex items-center text-sm">
          <span className="text-muted-foreground w-16">By:</span>
          <span className="text-foreground truncate">{createdBy}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        {canEdit && onEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(id);
            }}
            disabled={isLoading}
          >
            Edit
          </Button>
        )}
        {canActivate && onActivate && (
          <Button
            size="sm"
            variant="default"
            onClick={(e) => {
              e.stopPropagation();
              onActivate(id);
            }}
            disabled={isLoading}
          >
            Activate
          </Button>
        )}
        {canDeprecate && onDeprecate && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onDeprecate(id);
            }}
            disabled={isLoading}
            className="text-yellow-600 hover:text-yellow-700"
          >
            Deprecate
          </Button>
        )}
        {canArchive && onArchive && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onArchive(id);
            }}
            disabled={isLoading}
            className="text-gray-500 hover:text-gray-600"
          >
            Archive
          </Button>
        )}
      </div>
    </Card>
  );
}
