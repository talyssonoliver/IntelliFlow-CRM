'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';

// =============================================================================
// Types
// =============================================================================

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type SLAStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  slaStatus: SLAStatus;
  slaTimeRemaining: number; // minutes (negative = breached)
  contactName: string;
  contactEmail: string;
  assignee: string | null;
  assigneeAvatar: string | null;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Sample Data with SLA
// =============================================================================

const SAMPLE_TICKETS: Ticket[] = [
  {
    id: 'T-10924',
    subject: 'System Outage: West Region',
    description: 'Multiple customers reporting connectivity issues',
    status: 'OPEN',
    priority: 'CRITICAL',
    slaStatus: 'BREACHED',
    slaTimeRemaining: -134, // -02h 14m
    contactName: 'Robert Chen',
    contactEmail: 'r.chen@acmecorp.com',
    assignee: 'Sarah Jenkins',
    assigneeAvatar: 'SJ',
    createdAt: '2 hours ago',
    updatedAt: '10 mins ago',
  },
  {
    id: 'T-10921',
    subject: 'Login Failure for Enterprise Account',
    description: 'SSO authentication failing for GlobalTech',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    slaStatus: 'AT_RISK',
    slaTimeRemaining: 45, // 00h 45m
    contactName: 'David Kim',
    contactEmail: 'd.kim@globaltech.com',
    assignee: 'Mike Ross',
    assigneeAvatar: 'MR',
    createdAt: '3 hours ago',
    updatedAt: '1h ago',
  },
  {
    id: 'T-10899',
    subject: 'Feature Request: Dark Mode',
    description: 'Customer requesting dark mode for dashboard',
    status: 'OPEN',
    priority: 'LOW',
    slaStatus: 'ON_TRACK',
    slaTimeRemaining: 1330, // 22h 10m
    contactName: 'Amanda Wilson',
    contactEmail: 'a.wilson@startup.io',
    assignee: null,
    assigneeAvatar: null,
    createdAt: '5 hours ago',
    updatedAt: '3h ago',
  },
  {
    id: 'T-10887',
    subject: 'Billing Inquiry - Nov Invoice',
    description: 'Question about charges on November invoice',
    status: 'PENDING',
    priority: 'MEDIUM',
    slaStatus: 'ON_TRACK',
    slaTimeRemaining: 262, // 04h 22m
    contactName: 'Elena Rodriguez',
    contactEmail: 'elena@fintech.io',
    assignee: 'David Kim',
    assigneeAvatar: 'DK',
    createdAt: 'Yesterday',
    updatedAt: 'Yesterday',
  },
  {
    id: 'T-10755',
    subject: 'Integration API 500 Error',
    description: 'REST API returning 500 errors on POST requests',
    status: 'IN_PROGRESS',
    priority: 'CRITICAL',
    slaStatus: 'BREACHED',
    slaTimeRemaining: -725, // -12h 05m
    contactName: 'James Wilson',
    contactEmail: 'j.wilson@techstart.com',
    assignee: 'Alex Morgan',
    assigneeAvatar: 'AM',
    createdAt: '2 days ago',
    updatedAt: '2 days ago',
  },
  {
    id: 'T-10742',
    subject: 'Dashboard Performance Issues',
    description: 'Slow loading times during peak hours',
    status: 'OPEN',
    priority: 'HIGH',
    slaStatus: 'AT_RISK',
    slaTimeRemaining: 28, // 00h 28m
    contactName: 'Michael Brown',
    contactEmail: 'm.brown@enterprise.com',
    assignee: 'Sarah Jenkins',
    assigneeAvatar: 'SJ',
    createdAt: '1 day ago',
    updatedAt: '6h ago',
  },
];


// =============================================================================
// Utility Functions
// =============================================================================

function formatSLATime(minutes: number): string {
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
}

function getSLAConfig(status: SLAStatus) {
  switch (status) {
    case 'BREACHED':
      return {
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        textColor: 'text-red-600 dark:text-red-400',
        borderColor: 'border-red-200 dark:border-red-800',
        badgeBg: 'bg-red-100 dark:bg-red-900/30',
        badgeText: 'text-red-700 dark:text-red-300',
        icon: 'timer_off',
        label: 'Breached',
      };
    case 'AT_RISK':
      return {
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        textColor: 'text-yellow-700 dark:text-yellow-400',
        borderColor: 'border-yellow-200 dark:border-yellow-800',
        badgeBg: 'bg-yellow-100 dark:bg-yellow-900/30',
        badgeText: 'text-yellow-700 dark:text-yellow-400',
        icon: 'timelapse',
        label: 'At Risk',
      };
    case 'ON_TRACK':
      return {
        bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
        textColor: 'text-emerald-600 dark:text-emerald-400',
        borderColor: 'border-emerald-200 dark:border-emerald-800',
        badgeBg: 'bg-emerald-100 dark:bg-emerald-900/30',
        badgeText: 'text-emerald-700 dark:text-emerald-400',
        icon: 'schedule',
        label: 'On Track',
      };
  }
}

function getPriorityConfig(priority: TicketPriority) {
  switch (priority) {
    case 'CRITICAL':
      return { color: 'text-red-600 dark:text-red-400', icon: 'priority_high', label: 'Critical' };
    case 'HIGH':
      return { color: 'text-orange-600 dark:text-orange-400', icon: 'arrow_upward', label: 'High' };
    case 'MEDIUM':
      return { color: 'text-slate-600 dark:text-slate-400', icon: 'remove', label: 'Medium' };
    case 'LOW':
      return { color: 'text-slate-500 dark:text-slate-400', icon: 'arrow_downward', label: 'Low' };
  }
}

function getStatusConfig(status: TicketStatus) {
  switch (status) {
    case 'OPEN':
      return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'Open' };
    case 'IN_PROGRESS':
      return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'In Progress' };
    case 'PENDING':
      return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', label: 'Pending' };
    case 'RESOLVED':
      return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'Resolved' };
    case 'CLOSED':
      return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500', label: 'Closed' };
  }
}

// =============================================================================
// SLA Timer Component
// =============================================================================

function SLATimer({ slaStatus, timeRemaining }: { slaStatus: SLAStatus; timeRemaining: number }) {
  const config = getSLAConfig(slaStatus);

  return (
    <div
      className={`flex items-center gap-1.5 font-mono font-bold text-sm ${config.bgColor} ${config.textColor} px-2 py-1 rounded w-fit`}
    >
      <span className="material-symbols-outlined text-[16px]">{config.icon}</span>
      {formatSLATime(timeRemaining)}
    </div>
  );
}

// =============================================================================
// SLA Status Badge Component
// =============================================================================

function SLAStatusBadge({ slaStatus }: { slaStatus: SLAStatus }) {
  const config = getSLAConfig(slaStatus);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${config.badgeBg} ${config.badgeText} border ${config.borderColor}`}
    >
      {config.label}
    </span>
  );
}

// =============================================================================
// Priority Badge Component
// =============================================================================

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const config = getPriorityConfig(priority);

  return (
    <div className={`flex items-center gap-1.5 font-semibold text-xs uppercase ${config.color}`}>
      <span
        className="material-symbols-outlined text-[16px]"
        style={{ fontVariationSettings: priority === 'CRITICAL' ? "'FILL' 1" : undefined }}
      >
        {config.icon}
      </span>
      {config.label}
    </div>
  );
}

// =============================================================================
// Status Badge Component
// =============================================================================

function StatusBadge({ status }: { status: TicketStatus }) {
  const config = getStatusConfig(status);

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

// =============================================================================
// Main Tickets Page Component
// =============================================================================

export default function TicketsPage() {
  const [activeView, setActiveView] = useState('all');
  const [activeSLAFilter, setActiveSLAFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');


  // Calculate stats
  const stats = useMemo(() => {
    return {
      open: SAMPLE_TICKETS.filter((t) => t.status === 'OPEN').length,
      inProgress: SAMPLE_TICKETS.filter((t) => t.status === 'IN_PROGRESS').length,
      urgent: SAMPLE_TICKETS.filter((t) => t.priority === 'CRITICAL' || t.priority === 'HIGH').length,
      resolvedToday: 7, // Sample value
      breached: SAMPLE_TICKETS.filter((t) => t.slaStatus === 'BREACHED').length,
    };
  }, []);

  // Filter tickets
  const filteredTickets = useMemo(() => {
    return SAMPLE_TICKETS.filter((ticket) => {
      // Search filter
      const matchesSearch =
        searchQuery === '' ||
        ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.contactName.toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter
      const matchesStatus = statusFilter === '' || ticket.status === statusFilter;

      // Priority filter
      const matchesPriority = priorityFilter === '' || ticket.priority === priorityFilter;

      // SLA filter
      let matchesSLA = true;
      if (activeSLAFilter === 'breached') matchesSLA = ticket.slaStatus === 'BREACHED';
      else if (activeSLAFilter === 'at-risk') matchesSLA = ticket.slaStatus === 'AT_RISK';
      else if (activeSLAFilter === 'on-track') matchesSLA = ticket.slaStatus === 'ON_TRACK';

      // View filter
      let matchesView = true;
      if (activeView === 'breached') matchesView = ticket.slaStatus === 'BREACHED';
      else if (activeView === 'unassigned') matchesView = ticket.assignee === null;

      return matchesSearch && matchesStatus && matchesPriority && matchesSLA && matchesView;
    });
  }, [searchQuery, statusFilter, priorityFilter, activeSLAFilter, activeView]);

  // SLA filter tabs
  const slaFilters = [
    { id: 'all', label: 'All Tickets' },
    { id: 'breached', label: 'SLA Breached', color: 'bg-red-500' },
    { id: 'at-risk', label: 'At Risk', color: 'bg-yellow-500' },
    { id: 'on-track', label: 'On Track', color: 'bg-emerald-500' },
  ];

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Left Sidebar - Matching Mockup */}
      <aside className="w-64 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col hidden md:flex">
        <div className="p-4">
          {/* Ticket Management Section */}
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">
            Ticket Management
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => setActiveView('all')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                activeView === 'all'
                  ? 'bg-primary/10 text-primary dark:bg-slate-800 dark:text-white font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>list_alt</span>
              <span className="text-sm">All Tickets</span>
            </button>
            <button
              onClick={() => setActiveView('my')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                activeView === 'my'
                  ? 'bg-primary/10 text-primary dark:bg-slate-800 dark:text-white font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>assignment_ind</span>
              <span className="text-sm">My Assigned</span>
            </button>
            <button
              onClick={() => setActiveView('breached')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                activeView === 'breached'
                  ? 'bg-primary/10 text-primary dark:bg-slate-800 dark:text-white font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>timer</span>
              <span className="text-sm">SLA Breaches</span>
              <span className="ml-auto bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                {stats.breached}
              </span>
            </button>
            <button
              onClick={() => setActiveView('unresolved')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                activeView === 'unresolved'
                  ? 'bg-primary/10 text-primary dark:bg-slate-800 dark:text-white font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>pending_actions</span>
              <span className="text-sm">Unresolved</span>
            </button>
          </nav>

          {/* Configuration Section */}
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 mt-8 px-2">
            Configuration
          </div>
          <nav className="space-y-1">
            <Link
              href="/tickets/sla-policies"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>tune</span>
              <span className="text-sm">SLA Policies</span>
            </Link>
            <Link
              href="/tickets/types"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>category</span>
              <span className="text-sm">Ticket Types</span>
            </Link>
            <Link
              href="/tickets/automations"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>auto_awesome</span>
              <span className="text-sm">Automations</span>
            </Link>
          </nav>
        </div>

        {/* Help Card at Bottom */}
        <div className="mt-auto p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">Need help?</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Check our documentation for SLA configuration.
            </p>
            <button className="w-full py-1.5 px-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
              View Docs
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-8 bg-[#f6f7f8] dark:bg-[#101922]">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
          <Link href="/dashboard" className="hover:text-[#137fec]">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-white font-medium">Tickets</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Support Tickets
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base">
              Monitor real-time SLA compliance and prioritize urgent customer issues.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/tickets/analytics"
              className="group flex items-center justify-center gap-2 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-slate-700 dark:text-slate-200 font-medium py-2.5 px-5 rounded-lg shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-[#2d3a4a] focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                analytics
              </span>
              <span>Analytics</span>
            </Link>
            <Link
              href="/tickets/new"
              className="group flex items-center justify-center gap-2 bg-ds-primary hover:bg-ds-primary-hover text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-ds-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
            >
              <span
                className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform"
                aria-hidden="true"
              >
                add
              </span>
              <span>New Ticket</span>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="p-4 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ds-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl text-ds-primary">confirmation_number</span>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Open</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.open}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl text-amber-500">pending</span>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">In Progress</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.inProgress}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl text-red-500">timer_off</span>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">SLA Breached</p>
                <p className="text-2xl font-bold text-red-600">{stats.breached}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl text-green-500">check_circle</span>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Resolved Today</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.resolvedToday}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="p-4 mb-6 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <span className="material-symbols-outlined">search</span>
              </span>
              <input
                type="search"
                placeholder="Search tickets by subject, ID, or contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:border-transparent"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-ds-primary"
              >
                <option value="">All Status</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="PENDING">Pending</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-ds-primary"
              >
                <option value="">All Priority</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-ds-primary">
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="priority">By Priority</option>
                <option value="sla">By SLA</option>
              </select>
            </div>
          </div>

          {/* SLA Filter Tabs */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border-light dark:border-border-dark">
            {slaFilters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveSLAFilter(filter.id)}
                className={`h-8 px-4 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
                  activeSLAFilter === filter.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {filter.color && <span className={`size-2 rounded-full ${filter.color}`} />}
                {filter.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Data Table */}
        <Card className="overflow-hidden bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-light dark:border-border-dark">
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Ticket
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    SLA Timer
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    SLA Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Assignee
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light dark:divide-border-dark">
                {filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="group hover:bg-slate-50 dark:hover:bg-[#2d3a4a]/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <Link
                          href={`/tickets/${ticket.id}`}
                          className="font-bold text-[#137fec] hover:underline text-sm"
                        >
                          #{ticket.id}
                        </Link>
                        <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">
                          {ticket.subject}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {ticket.contactName}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <SLATimer slaStatus={ticket.slaStatus} timeRemaining={ticket.slaTimeRemaining} />
                    </td>
                    <td className="px-6 py-4">
                      <SLAStatusBadge slaStatus={ticket.slaStatus} />
                    </td>
                    <td className="px-6 py-4">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-6 py-4">
                      {ticket.assignee ? (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                            {ticket.assigneeAvatar}
                          </div>
                          <span className="text-sm text-slate-900 dark:text-white">
                            {ticket.assignee}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {ticket.updatedAt}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="p-1.5 rounded hover:bg-green-100 hover:text-green-600 text-slate-400 transition-colors"
                          title="Resolve"
                        >
                          <span className="material-symbols-outlined text-lg">check_circle</span>
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-red-100 hover:text-red-600 text-slate-400 transition-colors"
                          title="Escalate"
                        >
                          <span className="material-symbols-outlined text-lg">publish</span>
                        </button>
                        <button className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
                          <span className="material-symbols-outlined text-lg">more_vert</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredTickets.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      No tickets match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-border-light dark:border-border-dark flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Showing <span className="font-medium">1-{filteredTickets.length}</span> of{' '}
              <span className="font-medium">{SAMPLE_TICKETS.length}</span> tickets
            </p>
            <div className="flex items-center gap-1">
              <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-50">
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              <button className="w-8 h-8 rounded bg-[#137fec] text-white text-sm font-medium">
                1
              </button>
              <button className="w-8 h-8 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] text-sm">
                2
              </button>
              <button className="w-8 h-8 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] text-sm">
                3
              </button>
              <span className="text-slate-400">...</span>
              <button className="w-8 h-8 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] text-sm">
                9
              </button>
              <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
