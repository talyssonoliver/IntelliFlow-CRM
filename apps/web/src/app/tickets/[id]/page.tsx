'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@intelliflow/ui';

// =============================================================================
// Types
// =============================================================================

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type SLAStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';
type TabId = 'overview' | 'activity' | 'resolution' | 'attachments' | 'ai-insights';

interface TicketActivity {
  id: string;
  type: 'customer_message' | 'agent_reply' | 'internal_note' | 'system_event' | 'sla_breach' | 'priority_change';
  author: {
    name: string;
    role: 'customer' | 'agent' | 'system' | 'devops';
    avatar?: string;
  };
  content: string;
  timestamp: string;
  metadata?: {
    via?: string;
    oldPriority?: string;
    newPriority?: string;
  };
}

interface TicketDetail {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  slaStatus: SLAStatus;
  slaTimeRemaining: number;
  channel: 'email' | 'phone' | 'chat' | 'portal';
  category: string;
  type: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    title: string;
    company: string;
    avatar?: string;
    isVIP: boolean;
    totalTickets: number;
  };
  account: {
    id: string;
    name: string;
    industry: string;
    tier: string;
  };
  assignee: {
    name: string;
    title: string;
    avatar?: string;
  } | null;
  tags: string[];
  activities: TicketActivity[];
  nextSteps: Array<{
    id: string;
    title: string;
    dueDate: string;
    completed: boolean;
  }>;
  relatedTickets: Array<{
    id: string;
    subject: string;
    status: TicketStatus;
    similarity: number;
  }>;
  sla: {
    firstResponse: { target: number; actual: number | null; met: boolean };
    resolution: { target: number; remaining: number; status: SLAStatus };
  };
  aiInsights: {
    suggestedSolutions: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
    predictedResolutionTime: string;
    similarResolvedTickets: number;
    escalationRisk: 'low' | 'medium' | 'high';
  };
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Sample Data
// =============================================================================

const SAMPLE_TICKET: TicketDetail = {
  id: 'T-10924',
  subject: 'System Outage: West Region',
  description: 'Customer reported inability to access the dashboard from CA servers. Error 503 persisting. Multiple users affected across the organization. This is impacting their daily reporting workflow and needs urgent resolution.',
  status: 'OPEN',
  priority: 'CRITICAL',
  slaStatus: 'BREACHED',
  slaTimeRemaining: -134,
  channel: 'email',
  category: 'Technical Issue',
  type: 'Incident',
  customer: {
    id: 'c-123',
    name: 'David Kim',
    email: 'd.kim@solartech.com',
    phone: '+1 (555) 123-4567',
    title: 'Tech Lead',
    company: 'SolarTech Inc',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&h=160&fit=crop&crop=face',
    isVIP: true,
    totalTickets: 12,
  },
  account: {
    id: 'acc-456',
    name: 'SolarTech Inc',
    industry: 'Technology',
    tier: 'Enterprise',
  },
  assignee: {
    name: 'Sarah Jenkins',
    title: 'Senior Support Engineer',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&crop=face',
  },
  tags: ['Outage', 'West Region', 'P1'],
  activities: [
    {
      id: '1',
      type: 'customer_message',
      author: { name: 'David Kim', role: 'customer', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face' },
      content: 'Hi Support,\n\nOur team in the West Region is reporting consistent 503 errors when trying to load the main dashboard. This started about 30 minutes ago. We\'ve tried clearing cache and different browsers but the issue persists.\n\nPlease investigate ASAP as this is blocking our daily reporting.\n\nRegards,\nDavid',
      timestamp: 'Yesterday at 4:30 PM',
      metadata: { via: 'Email' },
    },
    {
      id: '2',
      type: 'system_event',
      author: { name: 'System', role: 'system' },
      content: 'automatically assigned priority',
      timestamp: 'Yesterday at 4:30 PM',
      metadata: { newPriority: 'High' },
    },
    {
      id: '3',
      type: 'agent_reply',
      author: { name: 'Sarah Jenkins', role: 'agent', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face' },
      content: 'Hello David,\n\nThanks for reaching out. I\'m looking into this immediately. We are checking our load balancers for the West region.\n\nI\'ve escalated this to our DevOps team.',
      timestamp: 'Yesterday at 4:45 PM',
    },
    {
      id: '4',
      type: 'priority_change',
      author: { name: 'Sarah Jenkins', role: 'agent' },
      content: 'changed priority to',
      timestamp: 'Yesterday at 5:00 PM',
      metadata: { newPriority: 'Critical' },
    },
    {
      id: '5',
      type: 'internal_note',
      author: { name: 'Mike Ross (DevOps)', role: 'devops' },
      content: 'We identified a degraded shard in the DB cluster. Replication lag is high. Creating a fix now.',
      timestamp: 'Today at 9:15 AM',
    },
    {
      id: '6',
      type: 'sla_breach',
      author: { name: 'System', role: 'system' },
      content: 'Resolution time exceeded by 2 hours',
      timestamp: '2 hours ago',
    },
  ],
  nextSteps: [
    { id: '1', title: 'Verify DB cluster fix deployment', dueDate: 'Due in 1 hour', completed: false },
    { id: '2', title: 'Confirm with customer resolution', dueDate: 'Due Today', completed: false },
    { id: '3', title: 'Document root cause for knowledge base', dueDate: 'Tomorrow', completed: false },
  ],
  relatedTickets: [
    { id: 'T-10890', subject: 'Slow dashboard loading - East Region', status: 'RESOLVED', similarity: 85 },
    { id: 'T-10756', subject: 'Database timeout errors', status: 'RESOLVED', similarity: 72 },
    { id: 'T-10923', subject: 'API latency issues', status: 'IN_PROGRESS', similarity: 68 },
  ],
  sla: {
    firstResponse: { target: 30, actual: 15, met: true },
    resolution: { target: 240, remaining: -134, status: 'BREACHED' },
  },
  aiInsights: {
    suggestedSolutions: [
      'Check DB cluster replication status - similar to T-10756',
      'Verify load balancer health checks for West region',
      'Review recent deployment changes in the last 24 hours',
    ],
    sentiment: 'negative',
    predictedResolutionTime: '2-4 hours',
    similarResolvedTickets: 8,
    escalationRisk: 'high',
  },
  createdAt: 'Yesterday at 4:30 PM',
  updatedAt: '2 hours ago',
};

const tabs: { id: TabId; label: string; count?: number }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity', count: 6 },
  { id: 'resolution', label: 'Resolution' },
  { id: 'attachments', label: 'Attachments', count: 3 },
  { id: 'ai-insights', label: 'AI Insights' },
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
      return { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800', label: 'Breached', icon: 'timer_off' };
    case 'AT_RISK':
      return { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-800', label: 'At Risk', icon: 'timelapse' };
    case 'ON_TRACK':
      return { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-800', label: 'On Track', icon: 'schedule' };
  }
}

function getStatusConfig(status: TicketStatus) {
  switch (status) {
    case 'OPEN': return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'Open' };
    case 'IN_PROGRESS': return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'In Progress' };
    case 'PENDING': return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', label: 'Pending' };
    case 'RESOLVED': return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'Resolved' };
    case 'CLOSED': return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500', label: 'Closed' };
  }
}

function getPriorityConfig(priority: TicketPriority) {
  switch (priority) {
    case 'CRITICAL': return { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', label: 'Critical' };
    case 'HIGH': return { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400', label: 'High' };
    case 'MEDIUM': return { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', label: 'Medium' };
    case 'LOW': return { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', label: 'Low' };
  }
}

function getChannelIcon(channel: string) {
  switch (channel) {
    case 'email': return 'mail';
    case 'phone': return 'call';
    case 'chat': return 'chat';
    case 'portal': return 'language';
    default: return 'help';
  }
}

// =============================================================================
// Main Component
// =============================================================================

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('public');
  const [replyContent, setReplyContent] = useState('');
  const [activityNote, setActivityNote] = useState('');

  // In production, fetch ticket by ticketId from API
  // For now, use sample data with the URL's ticketId
  const ticket = useMemo(() => ({
    ...SAMPLE_TICKET,
    id: ticketId || SAMPLE_TICKET.id,
  }), [ticketId]);

  const slaConfig = useMemo(() => getSLAConfig(ticket.slaStatus), [ticket.slaStatus]);
  const statusConfig = useMemo(() => getStatusConfig(ticket.status), [ticket.status]);
  const priorityConfig = useMemo(() => getPriorityConfig(ticket.priority), [ticket.priority]);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-[#0B1116] p-6 md:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-slate-500">
              <Link href="/tickets" className="hover:text-[#137fec] transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Tickets
              </Link>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-slate-900 dark:text-slate-200 font-medium">#{ticket.id}</span>
            </nav>

            {/* Title */}
            <div className="flex items-center gap-3 mt-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{ticket.subject}</h1>
              <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${statusConfig.bg} ${statusConfig.text}`}>
                {statusConfig.label}
              </span>
              <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${priorityConfig.bg} ${priorityConfig.text} uppercase`}>
                {priorityConfig.label}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <span className="material-symbols-outlined text-[18px]">edit</span>
              Edit
            </button>
            <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <span className="material-symbols-outlined text-[18px]">publish</span>
              Escalate
            </button>
            <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors shadow-sm">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              Resolve
            </button>
          </div>
        </div>

        {/* SLA Alert Banner */}
        {ticket.slaStatus === 'BREACHED' && (
          <div className={`flex items-center gap-3 p-4 rounded-lg ${slaConfig.bg} border ${slaConfig.border}`}>
            <span className={`material-symbols-outlined text-2xl ${slaConfig.text}`}>{slaConfig.icon}</span>
            <div className="flex-1">
              <p className={`font-bold ${slaConfig.text}`}>SLA Breached</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">Resolution time exceeded by {formatSLATime(Math.abs(ticket.slaTimeRemaining))}. Immediate action required.</p>
            </div>
            <div className={`font-mono text-2xl font-bold ${slaConfig.text}`}>
              {formatSLATime(ticket.slaTimeRemaining)}
            </div>
          </div>
        )}

        {/* Main 3-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

          {/* Left Sidebar - 3 cols */}
          <aside className="lg:col-span-3 flex flex-col gap-6">
            {/* About Ticket Card */}
            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
                About Ticket
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Channel</p>
                  <div className="flex items-center gap-2 text-slate-900 dark:text-slate-200 font-medium">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">{getChannelIcon(ticket.channel)}</span>
                    <span className="text-sm capitalize">{ticket.channel}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Category</p>
                  <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {ticket.category}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Type</p>
                  <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                    {ticket.type}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Created</p>
                  <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-200 font-medium">
                    <span className="material-symbols-outlined text-[16px] text-slate-400">schedule</span>
                    <span className="text-sm">{ticket.createdAt}</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 mb-1">Last Updated</p>
                  <span className="text-sm text-slate-700 dark:text-slate-300">{ticket.updatedAt}</span>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 mb-1">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {ticket.tags.map((tag) => (
                      <span key={tag} className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Customer Card */}
            <Card className="overflow-hidden">
              <div className="h-16 bg-gradient-to-r from-blue-100 to-blue-50 dark:from-slate-800 dark:to-slate-800" />
              <div className="px-5 pb-5 relative">
                <div className="relative -mt-8 mb-3">
                  <div className="w-16 h-16 rounded-full border-4 border-white dark:border-slate-900 bg-slate-200 overflow-hidden shadow-sm">
                    {ticket.customer.avatar ? (
                      <img src={ticket.customer.avatar} alt={ticket.customer.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg font-bold text-slate-600">
                        {ticket.customer.name.charAt(0)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{ticket.customer.name}</h3>
                    {ticket.customer.isVIP && (
                      <span className="px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-bold">VIP</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{ticket.customer.title}</p>
                  <Link href={`/accounts/${ticket.account.id}`} className="flex items-center gap-1 text-[#137fec] text-sm font-medium mt-1 hover:underline">
                    <span className="material-symbols-outlined text-[16px]">business</span>
                    {ticket.customer.company}
                  </Link>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">mail</span>
                    <a href={`mailto:${ticket.customer.email}`} className="text-slate-700 dark:text-slate-300 hover:text-[#137fec]">{ticket.customer.email}</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">call</span>
                    <a href={`tel:${ticket.customer.phone}`} className="text-slate-700 dark:text-slate-300 hover:text-[#137fec]">{ticket.customer.phone}</a>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#137fec]/10 text-[#137fec] text-xs font-semibold hover:bg-[#137fec]/20 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">mail</span>
                    Email
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#137fec]/10 text-[#137fec] text-xs font-semibold hover:bg-[#137fec]/20 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">call</span>
                    Call
                  </button>
                  <Link href={`/contacts/${ticket.customer.id}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">person</span>
                    Profile
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{ticket.customer.totalTickets}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Total Tickets</p>
                  </div>
                  <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{ticket.account.tier}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Account Tier</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Assignee Card */}
            <Card className="p-5 flex-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Assigned To</h3>
              {ticket.assignee ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
                    {ticket.assignee.avatar ? (
                      <img src={ticket.assignee.avatar} alt={ticket.assignee.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold">{ticket.assignee.name.charAt(0)}</div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{ticket.assignee.name}</p>
                    <p className="text-xs text-slate-500">{ticket.assignee.title}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Unassigned</p>
              )}
              <button className="w-full mt-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Reassign
              </button>
            </Card>
          </aside>

          {/* Center Content - 6 cols */}
          <section className="lg:col-span-6 flex flex-col">
            <Card className="flex-1">
              {/* Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 px-2 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'text-[#137fec] border-[#137fec]'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
                    }`}
                  >
                    {tab.label}
                    {tab.count !== undefined && (
                      <span className="ml-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">{tab.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Description */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Description</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{ticket.description}</p>
                    </div>

                    {/* Key Metrics */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                        <p className={`text-2xl font-bold ${ticket.sla.firstResponse.met ? 'text-green-600' : 'text-red-600'}`}>
                          {ticket.sla.firstResponse.actual}m
                        </p>
                        <p className="text-xs text-slate-500 mt-1">First Response</p>
                        <p className="text-[10px] text-slate-400">Target: {ticket.sla.firstResponse.target}m</p>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                        <p className={`text-2xl font-bold ${slaConfig.text}`}>
                          {formatSLATime(ticket.sla.resolution.remaining)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Resolution Time</p>
                        <p className="text-[10px] text-slate-400">Target: {ticket.sla.resolution.target}m</p>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{ticket.activities.length}</p>
                        <p className="text-xs text-slate-500 mt-1">Interactions</p>
                        <p className="text-[10px] text-slate-400">Last: {ticket.updatedAt}</p>
                      </div>
                    </div>

                    {/* Recent Activity Preview */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Recent Activity</h4>
                        <button onClick={() => setActiveTab('activity')} className="text-xs text-[#137fec] font-medium hover:underline">
                          View All
                        </button>
                      </div>
                      <div className="space-y-3">
                        {ticket.activities.slice(0, 3).map((activity) => (
                          <div key={activity.id} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {activity.author.avatar ? (
                                <img src={activity.author.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                              ) : (
                                activity.author.name.charAt(0)
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{activity.author.name}</p>
                              <p className="text-xs text-slate-500 truncate">{activity.content.substring(0, 80)}...</p>
                            </div>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">{activity.timestamp}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Activity Tab */}
                {activeTab === 'activity' && (
                  <div className="space-y-6">
                    {/* Activity Input */}
                    <div className="flex gap-3">
                      <div className="pt-1">
                        <div className="w-8 h-8 rounded-full bg-[#137fec] flex items-center justify-center text-white text-xs font-bold">
                          {ticket.assignee?.name.charAt(0) || 'U'}
                        </div>
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={activityNote}
                          onChange={(e) => setActivityNote(e.target.value)}
                          className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] min-h-[80px] p-3 placeholder:text-slate-400"
                          placeholder="Add a note, log activity..."
                        />
                        <div className="flex justify-between items-center mt-2">
                          <div className="flex gap-2">
                            <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                              <span className="material-symbols-outlined text-[20px]">attach_file</span>
                            </button>
                            <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                              <span className="material-symbols-outlined text-[20px]">alternate_email</span>
                            </button>
                          </div>
                          <button className="px-4 py-1.5 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors">
                            Add Note
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700 ml-4 space-y-6">
                      {ticket.activities.map((activity) => (
                        <div key={activity.id} className="relative pl-6">
                          {/* Timeline dot */}
                          <div className="absolute -left-[25px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-700 z-10">
                            {activity.type === 'customer_message' && <div className="w-full h-full rounded-full bg-slate-400" />}
                            {activity.type === 'agent_reply' && <div className="w-full h-full rounded-full bg-[#137fec]" />}
                            {activity.type === 'internal_note' && <div className="w-full h-full rounded-full bg-yellow-500" />}
                            {activity.type === 'system_event' && <div className="w-full h-full rounded-full bg-slate-300" />}
                            {activity.type === 'sla_breach' && <div className="w-full h-full rounded-full bg-red-500" />}
                            {activity.type === 'priority_change' && <div className="w-full h-full rounded-full bg-orange-500" />}
                          </div>

                          {/* Content */}
                          {(activity.type === 'customer_message' || activity.type === 'agent_reply') && (
                            <div className={`p-4 rounded-lg ${activity.type === 'agent_reply' ? 'bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-slate-900 dark:text-white">{activity.author.name}</span>
                                  {activity.metadata?.via && <span className="text-xs text-slate-500">via {activity.metadata.via}</span>}
                                </div>
                                <span className="text-xs text-slate-400">{activity.timestamp}</span>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{activity.content}</p>
                            </div>
                          )}

                          {activity.type === 'internal_note' && (
                            <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-slate-900 dark:text-white">{activity.author.name}</span>
                                  <span className="bg-yellow-200 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-400 text-[10px] font-bold px-1.5 rounded">INTERNAL</span>
                                </div>
                                <span className="text-xs text-slate-400">{activity.timestamp}</span>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300 italic">{activity.content}</p>
                            </div>
                          )}

                          {(activity.type === 'system_event' || activity.type === 'priority_change') && (
                            <div className="flex items-center gap-2 py-2">
                              <span className="text-xs text-slate-500">{activity.author.name} {activity.content}</span>
                              {activity.metadata?.newPriority && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  activity.metadata.newPriority === 'Critical' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                                }`}>
                                  {activity.metadata.newPriority}
                                </span>
                              )}
                              <span className="text-xs text-slate-400 ml-auto">{activity.timestamp}</span>
                            </div>
                          )}

                          {activity.type === 'sla_breach' && (
                            <div className="flex items-center gap-2 py-2 px-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
                              <span className="material-symbols-outlined text-red-500 text-[18px]">timer_off</span>
                              <span className="text-xs font-bold text-red-600 dark:text-red-400">SLA BREACHED</span>
                              <span className="text-xs text-slate-500">{activity.content}</span>
                              <span className="text-xs text-slate-400 ml-auto">{activity.timestamp}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Reply Composer */}
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        <div className="flex border-b border-slate-100 dark:border-slate-700">
                          <button
                            onClick={() => setReplyMode('public')}
                            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                              replyMode === 'public' ? 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200' : 'text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            Public Reply
                          </button>
                          <button
                            onClick={() => setReplyMode('internal')}
                            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                              replyMode === 'internal' ? 'bg-yellow-50 dark:bg-yellow-900/10 text-yellow-700' : 'text-slate-400 hover:bg-yellow-50'
                            }`}
                          >
                            Internal Note
                          </button>
                        </div>
                        <textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          className="w-full p-4 text-sm bg-transparent border-none focus:ring-0 min-h-[120px] resize-y placeholder:text-slate-400"
                          placeholder="Type your reply..."
                        />
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700">
                          <div className="flex gap-1">
                            <button className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition-colors">
                              <span className="material-symbols-outlined text-[18px]">format_bold</span>
                            </button>
                            <button className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition-colors">
                              <span className="material-symbols-outlined text-[18px]">attach_file</span>
                            </button>
                          </div>
                          <button className="px-4 py-1.5 bg-[#137fec] text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2">
                            Send Reply
                            <span className="material-symbols-outlined text-[16px]">send</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Resolution Tab */}
                {activeTab === 'resolution' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-900/30">
                      <div>
                        <p className="font-bold text-amber-800 dark:text-amber-400">Pending Resolution</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">This ticket requires a resolution.</p>
                      </div>
                      <span className="material-symbols-outlined text-amber-500 text-3xl">pending</span>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Resolution Type</label>
                        <select className="w-full py-2 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm">
                          <option>Select type...</option>
                          <option>Fixed</option>
                          <option>Workaround Provided</option>
                          <option>Cannot Reproduce</option>
                          <option>Duplicate</option>
                          <option>Won&apos;t Fix</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Root Cause</label>
                        <textarea className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 min-h-[80px]" placeholder="Describe the root cause..." />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Resolution Summary</label>
                        <textarea className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 min-h-[120px]" placeholder="Describe how the issue was resolved..." />
                      </div>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded border-slate-300 text-[#137fec]" />
                        <span className="text-sm text-slate-600 dark:text-slate-300">Notify customer of resolution</span>
                      </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Save Draft</button>
                      <button className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                        Mark as Resolved
                      </button>
                    </div>
                  </div>
                )}

                {/* Attachments Tab */}
                {activeTab === 'attachments' && (
                  <div className="space-y-6">
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center hover:border-[#137fec] hover:bg-[#137fec]/5 transition-colors cursor-pointer">
                      <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">cloud_upload</span>
                      <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">Drop files here or click to upload</p>
                      <p className="text-xs text-slate-500">PDF, DOC, PNG, JPG up to 10MB</p>
                    </div>

                    <div className="space-y-3">
                      {[
                        { name: 'error-logs-west-region.pdf', size: '2.4 MB', type: 'pdf', uploader: 'David Kim' },
                        { name: 'screenshot-503-error.png', size: '1.1 MB', type: 'image', uploader: 'David Kim' },
                        { name: 'devops-analysis.docx', size: '856 KB', type: 'doc', uploader: 'Mike Ross' },
                      ].map((file, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            file.type === 'pdf' ? 'bg-red-100 dark:bg-red-900/30' : file.type === 'image' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'
                          }`}>
                            <span className={`material-symbols-outlined ${
                              file.type === 'pdf' ? 'text-red-600' : file.type === 'image' ? 'text-blue-600' : 'text-green-600'
                            }`}>
                              {file.type === 'pdf' ? 'picture_as_pdf' : file.type === 'image' ? 'image' : 'description'}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{file.name}</p>
                            <p className="text-xs text-slate-500">{file.size} • {file.uploader}</p>
                          </div>
                          <button className="p-1.5 text-slate-400 hover:text-[#137fec] transition-colors">
                            <span className="material-symbols-outlined">download</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Insights Tab */}
                {activeTab === 'ai-insights' && (
                  <div className="space-y-6">
                    {/* Risk Assessment */}
                    <div className={`p-4 rounded-lg border ${
                      ticket.aiInsights.escalationRisk === 'high' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' :
                      ticket.aiInsights.escalationRisk === 'medium' ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800' :
                      'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className={`material-symbols-outlined text-2xl ${
                          ticket.aiInsights.escalationRisk === 'high' ? 'text-red-500' :
                          ticket.aiInsights.escalationRisk === 'medium' ? 'text-yellow-500' : 'text-green-500'
                        }`}>
                          {ticket.aiInsights.escalationRisk === 'high' ? 'warning' : 'insights'}
                        </span>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">Escalation Risk: <span className="capitalize">{ticket.aiInsights.escalationRisk}</span></p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">Predicted resolution time: {ticket.aiInsights.predictedResolutionTime}</p>
                        </div>
                      </div>
                    </div>

                    {/* Suggested Solutions */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#137fec] text-[20px]">lightbulb</span>
                        Suggested Solutions
                      </h4>
                      <div className="space-y-2">
                        {ticket.aiInsights.suggestedSolutions.map((solution, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                            <span className="text-[#137fec] font-bold text-sm">{i + 1}.</span>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{solution}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Similar Tickets */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-purple-500 text-[20px]">content_copy</span>
                        Similar Resolved Tickets ({ticket.aiInsights.similarResolvedTickets})
                      </h4>
                      <div className="space-y-2">
                        {ticket.relatedTickets.filter(t => t.status === 'RESOLVED').map((related) => (
                          <Link key={related.id} href={`/tickets/${related.id}`} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                            <div>
                              <span className="text-sm font-medium text-[#137fec]">#{related.id}</span>
                              <p className="text-sm text-slate-600 dark:text-slate-400">{related.subject}</p>
                            </div>
                            <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">{related.similarity}% match</span>
                          </Link>
                        ))}
                      </div>
                    </div>

                    {/* Sentiment */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                        <span className="text-3xl mb-2 block">
                          {ticket.aiInsights.sentiment === 'positive' ? '😊' : ticket.aiInsights.sentiment === 'negative' ? '😟' : '😐'}
                        </span>
                        <p className="text-sm font-medium text-slate-900 dark:text-white capitalize">{ticket.aiInsights.sentiment} Sentiment</p>
                        <p className="text-xs text-slate-500">Based on customer messages</p>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                        <p className="text-3xl font-bold text-[#137fec] mb-2">{ticket.aiInsights.similarResolvedTickets}</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">Similar Tickets Resolved</p>
                        <p className="text-xs text-slate-500">In the last 30 days</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </section>

          {/* Right Sidebar - 3 cols */}
          <aside className="lg:col-span-3 flex flex-col gap-6">
            {/* SLA Tracking */}
            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">SLA Tracking</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300">First Response</span>
                    <span className={ticket.sla.firstResponse.met ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {ticket.sla.firstResponse.met ? `Met (${ticket.sla.firstResponse.actual}m)` : 'Missed'}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${ticket.sla.firstResponse.met ? 'bg-green-500' : 'bg-red-500'} w-full`} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300">Resolution</span>
                    <span className={`font-medium ${slaConfig.text}`}>{slaConfig.label}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${ticket.slaStatus === 'BREACHED' ? 'bg-red-500' : ticket.slaStatus === 'AT_RISK' ? 'bg-yellow-500' : 'bg-green-500'} w-full`} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>Target: {ticket.sla.resolution.target}m</span>
                    <span className={slaConfig.text}>{formatSLATime(ticket.sla.resolution.remaining)}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Quick Actions */}
            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <button className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group">
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-green-600 mb-1" style={{ fontSize: '24px' }}>check_circle</span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:text-green-600">Resolve</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group">
                  <span className="material-symbols-outlined text-slate-400 mb-1" style={{ fontSize: '24px' }}>close</span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Close</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all group">
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-red-600 mb-1" style={{ fontSize: '24px' }}>publish</span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:text-red-600">Escalate</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#137fec] hover:bg-[#137fec]/5 transition-all group">
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-[#137fec] mb-1" style={{ fontSize: '24px' }}>forward</span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:text-[#137fec]">Assign</span>
                </button>
              </div>
            </Card>

            {/* Next Steps */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Next Steps</h3>
                <button className="w-6 h-6 flex items-center justify-center rounded bg-[#137fec]/10 hover:bg-[#137fec]/20 text-[#137fec] transition-colors">
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              </div>
              <div className="space-y-3">
                {ticket.nextSteps.map((step) => (
                  <label key={step.id} className="flex items-start gap-3 group cursor-pointer">
                    <input type="checkbox" defaultChecked={step.completed} className="mt-1 rounded border-slate-300 text-[#137fec] focus:ring-[#137fec]/50" />
                    <div className="text-sm">
                      <p className="font-medium text-slate-700 dark:text-slate-300 group-hover:text-[#137fec] transition-colors">{step.title}</p>
                      <p className={`text-xs mt-0.5 ${step.dueDate.includes('hour') ? 'text-red-500' : 'text-slate-400'}`}>{step.dueDate}</p>
                    </div>
                  </label>
                ))}
              </div>
            </Card>

            {/* Related Tickets */}
            <Card className="p-5 flex-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Related Tickets</h3>
              <div className="space-y-2">
                {ticket.relatedTickets.map((related) => {
                  const relatedStatus = getStatusConfig(related.status);
                  return (
                    <Link key={related.id} href={`/tickets/${related.id}`} className="block p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[#137fec]">#{related.id}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${relatedStatus.bg} ${relatedStatus.text}`}>
                          {relatedStatus.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-1">{related.subject}</p>
                    </Link>
                  );
                })}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
