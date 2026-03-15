'use client';

/**
 * Chain Versions Dashboard Component
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Overview dashboard showing active versions per chain type (4 cards).
 * Each card displays:
 * - Chain type name with icon
 * - Active version ID (or "None")
 * - Model name
 * - Last updated date
 */

import { Card, Skeleton } from '@intelliflow/ui';
import type { ChainType } from '@intelliflow/domain';
import type { ChainVersionSummary } from '@intelliflow/validators';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

interface ChainVersionsDashboardProps {
  activeVersions: Record<ChainType, ChainVersionSummary | null>;
  isLoading: boolean;
  onViewVersion?: (versionId: string) => void;
}

// Chain type configuration
const CHAIN_TYPE_CONFIG: Record<
  ChainType,
  {
    label: string;
    icon: string;
    description: string;
    color: string;
  }
> = {
  SCORING: {
    label: 'Lead Scoring',
    icon: '📊',
    description: 'AI-powered lead score calculation',
    color: 'border-l-blue-500',
  },
  QUALIFICATION: {
    label: 'Lead Qualification',
    icon: '✨',
    description: 'Automatic lead qualification',
    color: 'border-l-purple-500',
  },
  EMAIL_WRITER: {
    label: 'Email Writer',
    icon: '✉️',
    description: 'Personalized email generation',
    color: 'border-l-green-500',
  },
  FOLLOWUP: {
    label: 'Follow-up',
    icon: '🔄',
    description: 'Follow-up suggestion engine',
    color: 'border-l-orange-500',
  },
};

const CHAIN_TYPES: ChainType[] = ['SCORING', 'QUALIFICATION', 'EMAIL_WRITER', 'FOLLOWUP'];

export function ChainVersionsDashboard({
  activeVersions,
  isLoading,
  onViewVersion,
}: Readonly<ChainVersionsDashboardProps>) {
  const { timezone } = useTimezoneContext();
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CHAIN_TYPES.map((type) => (
          <Card key={type} className="p-4 border-l-4 border-l-gray-200">
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {CHAIN_TYPES.map((chainType) => {
        const config = CHAIN_TYPE_CONFIG[chainType];
        const version = activeVersions[chainType];

        return (
          <Card
            key={chainType}
            className={`p-4 border-l-4 ${config.color} hover:shadow-md transition-shadow cursor-pointer`}
            onClick={() => version && onViewVersion?.(version.id)}
            role={version ? 'button' : undefined}
            tabIndex={version ? 0 : undefined}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-2xl"
                role="img" // NOSONAR typescript:S6819 — emoji icon in span; <img> cannot render emoji characters
                aria-label={config.label}
              >
                {config.icon}
              </span>
              <div>
                <h3 className="font-semibold text-foreground">{config.label}</h3>
                <p className="text-xs text-muted-foreground">{config.description}</p>
              </div>
            </div>

            {/* Version Info */}
            {version ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Active Version</span>
                  <span className="text-xs font-mono text-foreground">
                    {version.id.slice(0, 8)}...
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Model</span>
                  <span className="text-xs font-medium text-foreground">{version.model}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Strategy</span>
                  <span className="text-xs text-foreground capitalize">
                    {version.rolloutStrategy.toLowerCase().replaceAll('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Created</span>
                  <span className="text-xs text-foreground">
                    {typeof version.createdAt === 'string'
                      ? new Date(version.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })
                      : version.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })}
                  </span>
                </div>

                {/* Status indicator */}
                <div className="pt-2 mt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                      Active
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm text-muted-foreground">No active version</p>
                <p className="text-xs text-muted-foreground mt-1">Create a draft and activate it</p>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
