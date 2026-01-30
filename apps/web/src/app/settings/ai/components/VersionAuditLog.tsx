'use client';

/**
 * Version Audit Log Component
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Paginated table showing version audit log entries.
 * Columns: Action, Version, User, Timestamp, Details
 */

import { useState } from 'react';
import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Button,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import type { ChainVersionAuditAction } from '@intelliflow/domain';
import { CHAIN_VERSION_AUDIT_ACTIONS } from '@intelliflow/domain';
import type { ChainVersionAudit } from '@intelliflow/validators';

interface VersionAuditLogProps {
  auditLog: ChainVersionAudit[] | undefined;
  isLoading: boolean;
}

// Action badge configuration - using design system compliant colors
const ACTION_CONFIG: Record<ChainVersionAuditAction, {
  color: string;
  icon: string;
}> = {
  CREATED: { color: 'bg-primary/10 text-primary', icon: '➕' },
  ACTIVATED: { color: 'bg-success/10 text-success', icon: '✅' },
  DEPRECATED: { color: 'bg-muted text-muted-foreground', icon: '⏳' },
  ARCHIVED: { color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: '📦' },
  ROLLED_BACK: { color: 'bg-accent/20 text-accent-foreground', icon: '↩️' },
};

const PAGE_SIZE = 20;

export function VersionAuditLog({ auditLog, isLoading }: VersionAuditLogProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<ChainVersionAuditAction | 'all'>('all');

  // Filter by action
  const filteredLog = auditLog?.filter(
    (entry) => actionFilter === 'all' || entry.action === actionFilter
  ) ?? [];

  // Pagination
  const totalPages = Math.ceil(filteredLog.length / PAGE_SIZE);
  const paginatedLog = filteredLog.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-10 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Audit Log</h3>
        <div className="w-48">
          <Select
            value={actionFilter}
            onValueChange={(value) => {
              setActionFilter(value as ChainVersionAuditAction | 'all');
              setCurrentPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {CHAIN_VERSION_AUDIT_ACTIONS.map((action) => (
                <SelectItem key={action} value={action}>
                  {ACTION_CONFIG[action].icon}{' '}
                  {action.charAt(0) + action.slice(1).toLowerCase().replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredLog.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>No audit entries found</p>
          {actionFilter !== 'all' && (
            <p className="text-sm mt-1">Try selecting a different action filter</p>
          )}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Action</TableHead>
                <TableHead className="w-48">Version</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLog.map((entry) => {
                const actionConfig = ACTION_CONFIG[entry.action];

                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge className={actionConfig.color}>
                        <span className="mr-1">{actionConfig.icon}</span>
                        {entry.action.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {entry.versionId.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.performedBy}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof entry.performedAt === 'string'
                        ? new Date(entry.performedAt).toLocaleString()
                        : entry.performedAt.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {entry.reason ? (
                        <span className="text-sm text-foreground" title={entry.reason}>
                          {entry.reason.length > 50
                            ? `${entry.reason.slice(0, 50)}...`
                            : entry.reason}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">-</span>
                      )}
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
                {Math.min((currentPage + 1) * PAGE_SIZE, filteredLog.length)} of{' '}
                {filteredLog.length}
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
