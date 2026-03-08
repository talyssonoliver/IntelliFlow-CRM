'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@intelliflow/ui';
import type { ADRMetadata } from '@/lib/adr/adr-service';

interface AdrCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

interface AdrListProps {
  adrs: ADRMetadata[];
  // bySprint and validationSummary not displayed — intentionally narrowed from getADRStats() return
  stats: { total: number; byStatus: Record<string, number> };
}

const ADR_CATEGORIES: AdrCategory[] = [
  {
    id: 'architecture-patterns',
    title: 'Architecture Patterns',
    description: 'Core architecture patterns and system design decisions',
    icon: 'architecture',
    color: 'bg-blue-500',
  },
  {
    id: 'data-security',
    title: 'Data & Security',
    description: 'Data management, encryption, and security architecture',
    icon: 'security',
    color: 'bg-red-500',
  },
  {
    id: 'ai-automation',
    title: 'AI & Automation',
    description: 'AI and machine learning framework decisions',
    icon: 'psychology',
    color: 'bg-amber-500',
  },
  {
    id: 'platform-infrastructure',
    title: 'Platform & Infrastructure',
    description: 'Platform services, CI/CD, and infrastructure choices',
    icon: 'cloud',
    color: 'bg-sky-500',
  },
  {
    id: 'domain-features',
    title: 'Domain & Features',
    description: 'Domain modeling, bounded contexts, and feature architecture',
    icon: 'domain',
    color: 'bg-emerald-500',
  },
  {
    id: 'process-tooling',
    title: 'Process & Tooling',
    description: 'Development process, tooling, and workflow decisions',
    icon: 'build',
    color: 'bg-violet-500',
  },
];

const STATUS_BADGE_MAP: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  Accepted: 'success',
  Proposed: 'warning',
  Deprecated: 'destructive',
  Rejected: 'destructive',
  Superseded: 'secondary',
};

/**
 * Maps ADR numeric IDs to category IDs based on topic ranges.
 * ADR-001 to ADR-004: Architecture Patterns
 * ADR-005 to ADR-009: Data & Security
 * ADR-010 to ADR-014: AI & Automation
 * ADR-015 to ADR-019: Platform & Infrastructure
 * ADR-020 to ADR-024: Domain & Features
 * ADR-025+: Process & Tooling
 */
function getCategoryForAdr(adr: Readonly<ADRMetadata>): string {
  const num = Number.parseInt(adr.id.replaceAll('ADR-', ''), 10);
  if (Number.isNaN(num)) return 'process-tooling';
  if (num <= 4) return 'architecture-patterns';
  if (num <= 9) return 'data-security';
  if (num <= 14) return 'ai-automation';
  if (num <= 19) return 'platform-infrastructure';
  if (num <= 24) return 'domain-features';
  return 'process-tooling';
}

const DDD_CONTEXTS = [
  { name: 'CRM', entities: 'Lead, Contact, Account, Opportunity, Task' },
  { name: 'Intelligence', entities: 'Agent, Chain, Embedding, Insight' },
  { name: 'Platform', entities: 'Tenant, User, Role, Subscription, Notification' },
  { name: 'Shared Kernel', entities: 'AuditLog, DomainEvent, ValueObject' },
];

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const variant = STATUS_BADGE_MAP[status] ?? 'secondary';
  return <Badge variant={variant}>{status}</Badge>;
}

export function AdrList({ adrs, stats }: Readonly<AdrListProps>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredAdrs = useMemo(() => {
    return adrs.filter((adr) => {
      if (statusFilter !== 'All' && adr.status !== statusFilter) return false;
      if (!debouncedQuery) return true;
      const q = debouncedQuery.toLowerCase();
      return (
        adr.id.toLowerCase().includes(q) ||
        adr.title.toLowerCase().includes(q) ||
        adr.technicalStory.toLowerCase().includes(q) ||
        adr.status.toLowerCase().includes(q)
      );
    });
  }, [adrs, debouncedQuery, statusFilter]);

  const groupedAdrs = useMemo(() => {
    const groups: Record<string, ADRMetadata[]> = {};
    for (const cat of ADR_CATEGORIES) {
      groups[cat.id] = [];
    }
    for (const adr of filteredAdrs) {
      const catId = getCategoryForAdr(adr);
      if (groups[catId]) {
        groups[catId].push(adr);
      }
    }
    return groups;
  }, [filteredAdrs]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      {/* Statistics summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{stats.total} total ADRs</span>
        {Object.entries(stats.byStatus).map(([status, count]) => (
          <span key={status}>
            {count} {status.toLowerCase()}
          </span>
        ))}
      </div>

      {/* Search and filter controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <label htmlFor="adr-search" className="sr-only">
            Search architecture decision records
          </label>
          <input
            id="adr-search"
            type="search"
            placeholder="Search ADRs by ID, title, or status..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
        <div>
          <label htmlFor="adr-status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="adr-status-filter"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={handleStatusChange}
          >
            <option value="All">All Statuses</option>
            <option value="Accepted">Accepted</option>
            <option value="Proposed">Proposed</option>
            <option value="Deprecated">Deprecated</option>
            <option value="Rejected">Rejected</option>
            <option value="Superseded">Superseded</option>
          </select>
        </div>
      </div>

      {/* Live region for screen readers — only announces after filtering */}
      <div aria-live="polite" className="sr-only">
        {(debouncedQuery || statusFilter !== 'All') &&
          `${filteredAdrs.length} ${filteredAdrs.length === 1 ? 'result' : 'results'} found`}
      </div>

      {/* ADR categories */}
      {ADR_CATEGORIES.map((category) => (
        <section key={category.id} aria-labelledby={`category-${category.id}`}>
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-10 h-10 ${category.color} rounded-lg flex items-center justify-center`}
            >
              <span className="material-symbols-outlined text-xl text-white" aria-hidden="true">
                {category.icon}
              </span>
            </div>
            <div>
              <h2 id={`category-${category.id}`} className="text-lg font-semibold text-foreground">
                {category.title}
              </h2>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {groupedAdrs[category.id]?.map((adr) => (
              <Link
                key={adr.id}
                href={`https://github.com/intelliflow-crm/intelliflow-crm/blob/main/${adr.filePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
              >
                <Card className="p-4 h-full transition-all hover:border-primary hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">{adr.id}</span>
                        <StatusBadge status={adr.status} />
                      </div>
                      <span className="font-medium text-foreground">{adr.title}</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        {adr.date} · {adr.deciders}
                      </p>
                    </div>
                    <span
                      className="material-symbols-outlined text-muted-foreground shrink-0"
                      aria-hidden="true"
                    >
                      open_in_new
                    </span>
                  </div>
                </Card>
                <span className="sr-only">(opens in new tab)</span>
              </Link>
            ))}
            {(!groupedAdrs[category.id] || groupedAdrs[category.id].length === 0) && (
              <p className="text-sm text-muted-foreground col-span-2 py-2">
                No ADRs in this category
                {debouncedQuery || statusFilter !== 'All' ? ' matching current filters' : ''}
              </p>
            )}
          </div>
        </section>
      ))}

      {/* DDD Bounded Context Map */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">DDD Bounded Context Map</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {DDD_CONTEXTS.map((ctx) => (
            <Card key={ctx.name} className="p-4">
              <h3 className="font-medium text-foreground mb-1">{ctx.name}</h3>
              <p className="text-sm text-muted-foreground">{ctx.entities}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
