'use client';

/**
 * Chain Versions Table Component
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Filterable, paginated table of chain versions.
 * Columns: Chain Type, Status (badge), Model, Created By, Created At, Actions
 * Filters: Chain Type dropdown, Status dropdown
 * Pagination: 20 items per page
 */

import { useState } from 'react';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import {
  Card,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  EmptyState,
} from '@intelliflow/ui';
import type { ChainType, ChainVersionStatus } from '@intelliflow/domain';
import { CHAIN_TYPES, CHAIN_VERSION_STATUSES } from '@intelliflow/domain';
import type { ChainVersionSummary } from '@intelliflow/validators';

interface ChainVersionsTableProps {
  versions: ChainVersionSummary[];
  isLoading: boolean;
  onSelect: (version: ChainVersionSummary) => void;
  onActivate: (versionId: string) => void;
  onDeprecate: (versionId: string) => void;
  onArchive: (versionId: string) => void;
  onRollback: (versionId: string) => void;
  selectedChainType: ChainType | 'all';
  selectedStatus: ChainVersionStatus | 'all';
  onChainTypeChange: (value: ChainType | 'all') => void;
  onStatusChange: (value: ChainVersionStatus | 'all') => void;
  isActioning?: boolean;
}

// Status badge configuration
const STATUS_BADGE_CONFIG: Record<
  ChainVersionStatus,
  {
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    className: string;
  }
> = {
  DRAFT: {
    variant: 'outline',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
  ACTIVE: {
    variant: 'default',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
  DEPRECATED: {
    variant: 'secondary',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  },
  ARCHIVED: {
    variant: 'outline',
    className: 'bg-gray-50 text-gray-500 dark:bg-gray-900/50 dark:text-gray-500',
  },
};

// Chain type labels
const CHAIN_TYPE_LABELS: Record<ChainType, string> = {
  SCORING: 'Lead Scoring',
  QUALIFICATION: 'Qualification',
  EMAIL_WRITER: 'Email Writer',
  FOLLOWUP: 'Follow-up',
};

const PAGE_SIZE = 20;

export function ChainVersionsTable({
  versions,
  isLoading,
  onSelect,
  onActivate,
  onDeprecate,
  onArchive,
  onRollback,
  selectedChainType,
  selectedStatus,
  onChainTypeChange,
  onStatusChange,
  isActioning = false,
}: Readonly<ChainVersionsTableProps>) {
  const { timezone } = useTimezoneContext();
  const [currentPage, setCurrentPage] = useState(0);

  // Pagination
  const totalPages = Math.ceil(versions.length / PAGE_SIZE);
  const paginatedVersions = versions.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          {/* Filter skeletons */}
          <div className="flex gap-4 mb-4">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-40" />
          </div>
          {/* Table skeletons */}
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" /> // NOSONAR typescript:S6479
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="w-48">
          <label htmlFor="chain-type-filter" className="text-xs text-muted-foreground mb-1 block">
            Chain Type
          </label>
          <Select
            value={selectedChainType}
            onValueChange={(value) => onChainTypeChange(value as ChainType | 'all')}
          >
            <SelectTrigger id="chain-type-filter">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {CHAIN_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CHAIN_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-48">
          <label htmlFor="chain-status-filter" className="text-xs text-muted-foreground mb-1 block">
            Status
          </label>
          <Select
            value={selectedStatus}
            onValueChange={(value) => onStatusChange(value as ChainVersionStatus | 'all')}
          >
            <SelectTrigger id="chain-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {CHAIN_VERSION_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {versions.length === 0 ? (
        <EmptyState entity="insights" variant="filtered" phase="passive" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chain Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedVersions.map((version) => {
                const statusConfig = STATUS_BADGE_CONFIG[version.status];
                const canActivate = version.status === 'DRAFT';
                const canDeprecate = version.status === 'ACTIVE';
                const canArchive = version.status === 'DEPRECATED';
                const canRollback =
                  version.status === 'DEPRECATED' || version.status === 'ARCHIVED';

                return (
                  <TableRow
                    key={version.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelect(version)}
                  >
                    <TableCell className="font-medium">
                      {CHAIN_TYPE_LABELS[version.chainType]}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig.variant} className={statusConfig.className}>
                        {version.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{version.model}</TableCell>
                    <TableCell className="text-muted-foreground">{version.createdBy}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof version.createdAt === 'string'
                        ? new Date(version.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })
                        : version.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canActivate && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={(e) => {
                              e.stopPropagation();
                              onActivate(version.id);
                            }}
                            disabled={isActioning}
                          >
                            Activate
                          </Button>
                        )}
                        {canDeprecate && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeprecate(version.id);
                            }}
                            disabled={isActioning}
                          >
                            Deprecate
                          </Button>
                        )}
                        {canArchive && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onArchive(version.id);
                            }}
                            disabled={isActioning}
                          >
                            Archive
                          </Button>
                        )}
                        {canRollback && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRollback(version.id);
                            }}
                            disabled={isActioning}
                          >
                            Rollback
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {currentPage * PAGE_SIZE + 1} to{' '}
                {Math.min((currentPage + 1) * PAGE_SIZE, versions.length)} of {versions.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
