'use client';

import { useState, useCallback, useMemo, useTransition } from 'react';
import Link from 'next/link';

/**
 * Lead List Page - IFC-014: PHASE-002 Next.js 16.0.10 App Router UI
 *
 * Features:
 * - RSC pattern with client interactivity
 * - Optimistic updates for filters and search
 * - WCAG 2.1 AA accessibility compliance
 * - Design matches mockup: docs/design/mockups/lead-list.html
 */

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'NEGOTIATING' | 'CONVERTED' | 'LOST';

interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  status: LeadStatus;
  score: number;
  createdAt: string;
  avatarUrl?: string;
}

// Placeholder data until API is connected (IFC-013 dependency)
const placeholderLeads: Lead[] = [
  {
    id: '1',
    email: 'sarah@techcorp.com',
    firstName: 'Sarah',
    lastName: 'Miller',
    company: 'TechCorp',
    title: 'CTO',
    status: 'QUALIFIED',
    score: 85,
    createdAt: '2 hours ago',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
  },
  {
    id: '2',
    email: 'd.chen@designco.com',
    firstName: 'David',
    lastName: 'Chen',
    company: 'DesignCo',
    title: 'Manager',
    status: 'NEW',
    score: 42,
    createdAt: 'Yesterday',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face',
  },
  {
    id: '3',
    email: 'amanda@gmail.com',
    firstName: 'Amanda',
    lastName: 'Smith',
    company: 'Freelance',
    title: null,
    status: 'UNQUALIFIED',
    score: 15,
    createdAt: 'Oct 12, 2023',
  },
  {
    id: '4',
    email: 'j.wilson@globalsoft.com',
    firstName: 'James',
    lastName: 'Wilson',
    company: 'GlobalSoft',
    title: 'VP Sales',
    status: 'NEGOTIATING',
    score: 92,
    createdAt: 'Oct 10, 2023',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face',
  },
  {
    id: '5',
    email: 'elena@fintech.io',
    firstName: 'Elena',
    lastName: 'Rodriguez',
    company: 'FinTech',
    title: 'Product Manager',
    status: 'CONTACTED',
    score: 55,
    createdAt: 'Oct 08, 2023',
  },
];

export default function LeadsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [scoreFilter, setScoreFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('newest');
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Optimistic filtering with useTransition for smooth UI
  const filteredLeads = useMemo(() => {
    let leads = [...placeholderLeads];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      leads = leads.filter(
        (lead) =>
          lead.firstName?.toLowerCase().includes(query) ||
          lead.lastName?.toLowerCase().includes(query) ||
          lead.email.toLowerCase().includes(query) ||
          lead.company?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter) {
      leads = leads.filter((lead) => lead.status === statusFilter);
    }

    // Score filter
    if (scoreFilter) {
      switch (scoreFilter) {
        case 'high':
          leads = leads.filter((lead) => lead.score >= 80);
          break;
        case 'medium':
          leads = leads.filter((lead) => lead.score >= 50 && lead.score < 80);
          break;
        case 'low':
          leads = leads.filter((lead) => lead.score < 50);
          break;
      }
    }

    // Sort
    switch (sortOrder) {
      case 'oldest':
        leads.reverse();
        break;
      case 'score-high':
        leads.sort((a, b) => b.score - a.score);
        break;
      case 'score-low':
        leads.sort((a, b) => a.score - b.score);
        break;
    }

    return leads;
  }, [searchQuery, statusFilter, scoreFilter, sortOrder]);

  // Handle search with optimistic update
  const handleSearch = useCallback((value: string) => {
    startTransition(() => {
      setSearchQuery(value);
    });
  }, []);

  // Handle select all
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedLeads(new Set(filteredLeads.map((l) => l.id)));
      } else {
        setSelectedLeads(new Set());
      }
    },
    [filteredLeads]
  );

  // Handle individual selection
  const handleSelectLead = useCallback((leadId: string, checked: boolean) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(leadId);
      } else {
        next.delete(leadId);
      }
      return next;
    });
  }, []);

  const allSelected = filteredLeads.length > 0 && selectedLeads.size === filteredLeads.length;
  const someSelected = selectedLeads.size > 0 && selectedLeads.size < filteredLeads.length;

  return (
    <>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex">
        <ol className="flex items-center space-x-2" role="list">
          <li>
            <Link
              href="/dashboard"
              className="text-slate-500 dark:text-slate-400 hover:text-ds-primary dark:hover:text-ds-primary transition-colors text-sm font-medium"
            >
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true">
            <span className="text-slate-300 dark:text-slate-600">/</span>
          </li>
          <li>
            <span aria-current="page" className="text-slate-900 dark:text-white text-sm font-medium">
              Leads
            </span>
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight"> 
            Lead List
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">
            Manage and track your potential customers effectively.
          </p>
        </div>
        <Link
          href="/leads/new"
          className="group flex items-center justify-center gap-2 bg-ds-primary hover:bg-ds-primary-hover text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-ds-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
        >
          <span
            className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform"
            aria-hidden="true"
          >
            add
          </span>
          <span>New Lead</span>
        </Link>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-surface-light dark:bg-surface-dark p-4 rounded-xl border border-border-light dark:border-border-dark shadow-sm flex flex-col lg:flex-row gap-4 items-center">
        {/* Search */}
        <div className="relative flex-1 w-full" role="search">
          <label htmlFor="lead-search" className="sr-only">
            Search leads
          </label>
          <span
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            search
          </span>
          <input
            id="lead-search"
            type="search"
            placeholder="Search leads by name, email, or company..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-background-light dark:bg-background-dark border-none rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-ds-primary/50 text-sm font-medium"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Status Filter */}
          <div className="relative">
            <label htmlFor="status-filter" className="sr-only">
              Filter by status
            </label>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2.5 bg-background-light dark:bg-background-dark hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors"
              onClick={() => {
                // Toggle dropdown - simplified for demo
              }}
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                filter_list
              </span>
              <span>Status</span>
              <span className="material-symbols-outlined text-[18px] text-slate-400" aria-hidden="true">
                expand_more
              </span>
            </button>
          </div>

          {/* Score Filter */}
          <div className="relative">
            <label htmlFor="score-filter" className="sr-only">
              Filter by score
            </label>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2.5 bg-background-light dark:bg-background-dark hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                military_tech
              </span>
              <span>Score</span>
              <span className="material-symbols-outlined text-[18px] text-slate-400" aria-hidden="true">
                expand_more
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-border-light dark:bg-border-dark mx-1 hidden sm:block" aria-hidden="true" />

          {/* Sort */}
          <div className="relative ml-auto sm:ml-0">
            <label htmlFor="sort-order" className="sr-only">
              Sort order
            </label>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2.5 bg-background-light dark:bg-background-dark hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                sort
              </span>
              <span>Newest First</span>
            </button>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden flex flex-col"
        role="region"
        aria-label="Leads table"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <caption className="sr-only">
              List of leads with their details, scores, and status
            </caption>
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-border-light dark:border-border-dark">
              <tr>
                <th scope="col" className="py-4 pl-6 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 w-12">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-slate-300 text-ds-primary focus:ring-ds-primary bg-transparent"
                    aria-label="Select all leads"
                  />
                </th>
                <th scope="col" className="py-4 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 min-w-[250px]">
                  Lead Name / Company
                </th>
                <th scope="col" className="py-4 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hidden md:table-cell">
                  Email
                </th>
                <th scope="col" className="py-4 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Score
                </th>
                <th scope="col" className="py-4 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Status
                </th>
                <th scope="col" className="py-4 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hidden lg:table-cell">
                  Created Date
                </th>
                <th scope="col" className="py-4 px-4 pr-6 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">
                  <span className="sr-only">Actions</span>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light dark:divide-border-dark">
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-4 pl-6 pr-4">
                    <input
                      type="checkbox"
                      checked={selectedLeads.has(lead.id)}
                      onChange={(e) => handleSelectLead(lead.id, e.target.checked)}
                      className="rounded border-slate-300 text-ds-primary focus:ring-ds-primary bg-transparent"
                      aria-label={`Select ${lead.firstName} ${lead.lastName}`}
                    />
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <LeadAvatar lead={lead} />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {lead.firstName} {lead.lastName}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {lead.title ? `${lead.title} @ ${lead.company}` : lead.company}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 hidden md:table-cell">
                    <a
                      href={`mailto:${lead.email}`}
                      className="text-sm text-ds-primary hover:underline"
                    >
                      {lead.email}
                    </a>
                  </td>
                  <td className="py-4 px-4">
                    <ScoreBadge score={lead.score} />
                  </td>
                  <td className="py-4 px-4">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="py-4 px-4 hidden lg:table-cell">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{lead.createdAt}</span>
                  </td>
                  <td className="py-4 px-4 pr-6 text-right">
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-ds-primary"
                      aria-label={`More options for ${lead.firstName} ${lead.lastName}`}
                      aria-haspopup="menu"
                    >
                      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                        more_vert
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-light dark:border-border-dark bg-slate-50/50 dark:bg-slate-800/30">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Showing <span className="font-bold text-slate-900 dark:text-white">1-{filteredLeads.length}</span> of{' '}
            <span className="font-bold text-slate-900 dark:text-white">50</span> leads
          </span>
          <nav className="flex items-center gap-2" aria-label="Pagination">
            <button
              type="button"
              disabled
              className="flex items-center justify-center size-9 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                chevron_left
              </span>
            </button>
            <button
              type="button"
              className="flex items-center justify-center size-9 rounded-lg bg-ds-primary text-white text-sm font-semibold shadow-sm shadow-ds-primary/30"
              aria-label="Page 1"
              aria-current="page"
            >
              1
            </button>
            <button
              type="button"
              className="flex items-center justify-center size-9 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium transition-colors"
              aria-label="Page 2"
            >
              2
            </button>
            <button
              type="button"
              className="flex items-center justify-center size-9 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium transition-colors"
              aria-label="Page 3"
            >
              3
            </button>
            <span className="text-slate-400 text-sm" aria-hidden="true">
              ...
            </span>
            <button
              type="button"
              className="flex items-center justify-center size-9 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium transition-colors"
              aria-label="Page 10"
            >
              10
            </button>
            <button
              type="button"
              className="flex items-center justify-center size-9 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="Next page"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                chevron_right
              </span>
            </button>
          </nav>
        </div>
      </div>
    </>
  );
}

/**
 * Lead Avatar Component
 * Shows image if available, otherwise shows initials with color based on name
 */
function LeadAvatar({ lead }: { lead: Lead }) {
  const initials = `${lead.firstName?.[0] || ''}${lead.lastName?.[0] || ''}`.toUpperCase();

  // Generate a consistent color based on the name
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-amber-200 text-amber-800 border-amber-300',
      'bg-indigo-100 text-indigo-700 border-indigo-200',
      'bg-emerald-100 text-emerald-700 border-emerald-200',
      'bg-rose-100 text-rose-700 border-rose-200',
      'bg-sky-100 text-sky-700 border-sky-200',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  if (lead.avatarUrl) {
    return (
      <div
        className="size-10 rounded-full bg-cover bg-center shrink-0 border border-slate-200 dark:border-slate-700"
        style={{ backgroundImage: `url('${lead.avatarUrl}')` }}
        role="img"
        aria-label={`Photo of ${lead.firstName} ${lead.lastName}`}
      />
    );
  }

  return (
    <div
      className={`size-10 rounded-full shrink-0 flex items-center justify-center font-bold text-sm border ${getAvatarColor(
        `${lead.firstName}${lead.lastName}`
      )}`}
      role="img"
      aria-label={`Avatar for ${lead.firstName} ${lead.lastName}`}
    >
      {initials}
    </div>
  );
}

/**
 * Status Badge Component
 * Displays lead status with color coding matching the mockup
 */
function StatusBadge({ status }: { status: LeadStatus }) {
  const config: Record<LeadStatus, { label: string; className: string }> = {
    NEW: {
      label: 'New',
      className: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
    },
    CONTACTED: {
      label: 'Contacted',
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    },
    QUALIFIED: {
      label: 'Qualified',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    },
    UNQUALIFIED: {
      label: 'Unqualified',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    },
    NEGOTIATING: {
      label: 'Negotiating',
      className: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    },
    CONVERTED: {
      label: 'Converted',
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    LOST: {
      label: 'Lost',
      className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
    },
  };

  const { label, className } = config[status];

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

/**
 * Score Badge Component
 * Displays lead score with color-coded indicator matching the mockup
 * - Green (>=80): High score
 * - Amber (50-79): Medium score
 * - Red (<50): Low score
 */
function ScoreBadge({ score }: { score: number }) {
  const getScoreConfig = (score: number) => {
    if (score >= 80) {
      return {
        bgClass: 'bg-green-100 dark:bg-green-500/20',
        textClass: 'text-green-700 dark:text-green-400',
        dotClass: 'bg-green-500',
        borderClass: 'border-green-200 dark:border-green-500/20',
      };
    }
    if (score >= 50) {
      return {
        bgClass: 'bg-amber-100 dark:bg-amber-500/20',
        textClass: 'text-amber-700 dark:text-amber-400',
        dotClass: 'bg-amber-500',
        borderClass: 'border-amber-200 dark:border-amber-500/20',
      };
    }
    return {
      bgClass: 'bg-red-100 dark:bg-red-500/20',
      textClass: 'text-red-700 dark:text-red-400',
      dotClass: 'bg-red-500',
      borderClass: 'border-red-200 dark:border-red-500/20',
    };
  };

  const { bgClass, textClass, dotClass, borderClass } = getScoreConfig(score);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${bgClass} ${textClass} border ${borderClass}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {score}
    </span>
  );
}
