'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Button } from '@intelliflow/ui';
// Material Symbols icon helper component
const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
    {name}
  </span>
);

// =============================================================================
// Types
// =============================================================================

type StageId = 'PROSPECTING' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';

interface Deal {
  id: string;
  name: string;
  value: number;
  stage: StageId;
  stageIndex: number;
  probability: number;
  expectedCloseDate: string | null;
  source: string;
  owner: {
    name: string;
    avatar: string;
  };
  account: {
    name: string;
    location: string;
  };
  contact: {
    name: string;
    title: string;
    avatar: string;
  };
  products: Array<{
    name: string;
    description: string;
    price: number;
  }>;
  nextSteps: Array<{
    id: string;
    title: string;
    dueDate: string;
    completed: boolean;
  }>;
  files: Array<{
    name: string;
    size: string;
    date: string;
    type: 'pdf' | 'doc' | 'xls';
  }>;
}

type ActivityType = 'email' | 'call' | 'stage_change' | 'note' | 'task' | 'agent_action';
type AgentActionStatus = 'pending_approval' | 'approved' | 'rejected' | 'rolled_back' | 'expired';

interface ActivityEvent {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: string;
  date: string; // 'today' | 'yesterday' | date string
  attachment?: {
    name: string;
    type: string;
  };
  stageChange?: {
    from: string;
    to: string;
  };
  // Agent action specific
  agentActionId?: string;
  agentName?: string;
  confidenceScore?: number;
  agentStatus?: AgentActionStatus;
}

// =============================================================================
// Constants
// =============================================================================

const STAGES = [
  { id: 'PROSPECTING', label: 'Prospecting' },
  { id: 'QUALIFICATION', label: 'Qualification' },
  { id: 'PROPOSAL', label: 'Proposal' },
  { id: 'NEGOTIATION', label: 'Negotiation' },
  { id: 'CLOSED', label: 'Closed' },
] as const;

// =============================================================================
// Sample Data
// =============================================================================

const SAMPLE_DEAL: Deal = {
  id: 'DL-4920',
  name: 'Acme Corp Software License',
  value: 125000,
  stage: 'PROPOSAL',
  stageIndex: 2,
  probability: 60,
  expectedCloseDate: '2025-01-24',
  source: 'Web Referral',
  owner: {
    name: 'Jane Doe',
    avatar: 'JD',
  },
  account: {
    name: 'Acme Corp',
    location: 'San Francisco, CA',
  },
  contact: {
    name: 'Robert Fox',
    title: 'CTO',
    avatar: 'RF',
  },
  products: [
    { name: 'Enterprise License', description: 'Qty: 100 Seats', price: 100000 },
    { name: 'Implementation', description: 'Standard Package', price: 25000 },
  ],
  nextSteps: [
    { id: '1', title: 'Send revised contract', dueDate: 'Due Tomorrow', completed: false },
    { id: '2', title: 'Schedule tech review', dueDate: 'Jan 20, 2025', completed: false },
  ],
  files: [
    { name: 'Acme_MSA_v3.pdf', size: '2.4 MB', date: 'Dec 15', type: 'pdf' },
    { name: 'Requirements_Doc.docx', size: '1.1 MB', date: 'Dec 10', type: 'doc' },
  ],
};

const SAMPLE_ACTIVITIES: ActivityEvent[] = [
  {
    id: 'agent-1',
    type: 'agent_action',
    title: 'AI: Advance deal to negotiation stage',
    description: 'Pipeline Intelligence Agent detected positive signals from recent communication',
    timestamp: '11:30 AM',
    date: 'today',
    agentActionId: 'action-3',
    agentName: 'Pipeline Intelligence Agent',
    confidenceScore: 92,
    agentStatus: 'pending_approval',
  },
  {
    id: '1',
    type: 'email',
    title: 'Email Sent: Proposal V2',
    description: 'Attached the updated pricing model as discussed in the meeting.',
    timestamp: '10:42 AM',
    date: 'today',
    attachment: { name: 'Proposal_Acme_v2.pdf', type: 'pdf' },
  },
  {
    id: 'agent-2',
    type: 'agent_action',
    title: 'AI: Schedule follow-up meeting',
    description: 'Task Automation Agent identified optimal meeting time based on calendars',
    timestamp: '9:15 AM',
    date: 'today',
    agentActionId: 'action-4',
    agentName: 'Task Automation Agent',
    confidenceScore: 78,
    agentStatus: 'approved',
  },
  {
    id: '2',
    type: 'call',
    title: 'Call with Robert Fox',
    description: 'Discussed timeline for implementation. They are keen to start by Nov 1st. Need to adjust contract start date.',
    timestamp: '2:15 PM',
    date: 'yesterday',
  },
  {
    id: '3',
    type: 'stage_change',
    title: 'Stage Changed',
    timestamp: '9:30 AM',
    date: 'yesterday',
    stageChange: { from: 'Qualification', to: 'Proposal' },
  },
];

// =============================================================================
// Utility Functions
// =============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getActivityIcon(type: ActivityType): React.ReactNode {
  switch (type) {
    case 'email':
      return <Icon name="mail" className="text-xl text-primary" />;
    case 'call':
      return <Icon name="phone" className="text-xl text-green-600" />;
    case 'stage_change':
      return <Icon name="trending_up" className="text-xl text-orange-500" />;
    case 'note':
      return <Icon name="chat" className="text-xl text-blue-500" />;
    case 'task':
      return <Icon name="check_circle" className="text-xl text-purple-500" />;
    case 'agent_action':
      return <Icon name="smart_toy" className="text-xl text-purple-600" />;
    default:
      return <Icon name="description" className="text-xl text-slate-400" />;
  }
}

function getAgentStatusBadge(status: AgentActionStatus): { label: string; className: string } {
  switch (status) {
    case 'pending_approval':
      return { label: 'Pending Review', className: 'bg-amber-100 text-amber-800' };
    case 'approved':
      return { label: 'Approved', className: 'bg-green-100 text-green-800' };
    case 'rejected':
      return { label: 'Rejected', className: 'bg-red-100 text-red-800' };
    case 'rolled_back':
      return { label: 'Rolled Back', className: 'bg-purple-100 text-purple-800' };
    case 'expired':
      return { label: 'Expired', className: 'bg-slate-100 text-slate-600' };
    default:
      return { label: status, className: 'bg-slate-100 text-slate-600' };
  }
}

// =============================================================================
// Components
// =============================================================================

function StageProgress({ currentStageIndex, probability }: { currentStageIndex: number; probability: number }) {
  const progressWidth = ((currentStageIndex + 1) / STAGES.length) * 100;

  return (
    <Card className="p-6">
      <div className="flex justify-between items-end mb-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Total Value</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">
            {formatCurrency(SAMPLE_DEAL.value)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {STAGES[currentStageIndex].label}
          </p>
          <p className="text-xs text-slate-500">
            Stage {currentStageIndex + 1} of {STAGES.length} &bull; {probability}% Probability
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progressWidth}%` }}
        />
        {/* Stage dividers */}
        <div className="absolute top-0 left-0 w-full h-full flex justify-between px-[10%]">
          {[...Array(STAGES.length - 1)].map((_, i) => (
            <div key={i} className="w-0.5 h-full bg-white dark:bg-slate-900 opacity-50" />
          ))}
        </div>
      </div>

      {/* Stage Labels */}
      <div className="flex justify-between mt-2 text-xs font-medium text-slate-500 px-1">
        {STAGES.map((stage, index) => (
          <span
            key={stage.id}
            className={index <= currentStageIndex ? 'text-primary' : ''}
          >
            {stage.label}
          </span>
        ))}
      </div>
    </Card>
  );
}

function AboutDealCard({ deal }: { deal: Deal }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4 border-b pb-2">
        About Deal
      </h3>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Expected Close Date</p>
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-200 font-medium">
            <Icon name="calendar_today" className="text-base text-slate-400" />
            {deal.expectedCloseDate
              ? new Date(deal.expectedCloseDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Not set'}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Owner</p>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium">
              {deal.owner.avatar}
            </div>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {deal.owner.name}
            </span>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Source</p>
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
            {deal.source}
          </span>
        </div>
      </div>
    </Card>
  );
}

function StakeholdersCard({ deal }: { deal: Deal }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4 border-b pb-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Stakeholders
        </h3>
        <button className="text-primary hover:text-primary/80 text-xs font-semibold">
          Edit
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {/* Account */}
        <div className="flex items-start gap-3">
          <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
            <Icon name="apartment" className="text-xl" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{deal.account.name}</p>
            <p className="text-xs text-slate-500">{deal.account.location}</p>
            <div className="flex gap-2 mt-2">
              <button className="text-slate-400 hover:text-primary">
                <Icon name="open_in_new" className="text-base" />
              </button>
              <button className="text-slate-400 hover:text-primary">
                <Icon name="language" className="text-base" />
              </button>
            </div>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        {/* Contact */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium">
            {deal.contact.avatar}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{deal.contact.name}</p>
            <p className="text-xs text-slate-500">{deal.contact.title}</p>
            <div className="flex gap-3 mt-2">
              <button className="bg-primary/10 hover:bg-primary/20 p-1.5 rounded text-primary transition-colors">
                <Icon name="mail" className="text-base" />
              </button>
              <button className="bg-primary/10 hover:bg-primary/20 p-1.5 rounded text-primary transition-colors">
                <Icon name="phone" className="text-base" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ActivityTimeline({ activities, dealId }: { activities: ActivityEvent[]; dealId: string }) {
  const [activeTab, setActiveTab] = useState<'activity' | 'notes' | 'emails'>('activity');

  const groupedActivities = useMemo(() => {
    const groups: { [key: string]: ActivityEvent[] } = {};
    activities.forEach((activity) => {
      const key = activity.date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(activity);
    });
    return groups;
  }, [activities]);

  const getDateLabel = (date: string): string => {
    if (date === 'today') return 'Today';
    if (date === 'yesterday') return 'Yesterday';
    return date;
  };

  return (
    <div className="space-y-4">
      {/* Activity Header with View All */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Activity</h3>
        <Link
          href={`/cases/timeline?dealId=${dealId}`}
          className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1"
        >
          View All
          <Icon name="chevron_right" className="text-base" />
        </Link>
      </div>

      {/* Activity Input */}
      <Card className="p-4">
        <div className="flex gap-4 border-b pb-3 mb-3">
          {(['activity', 'notes', 'emails'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 -mb-3.5 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'text-primary border-b-2 border-primary font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Log a call, note, or task..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          />
          <button className="p-2.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            <Icon name="phone" className="text-xl" />
          </button>
          <button className="p-2.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            <Icon name="check_circle" className="text-xl" />
          </button>
          <Button>Save</Button>
        </div>
      </Card>

      {/* Timeline */}
      <div className="flex flex-col gap-4 relative pl-4 border-l-2 border-slate-200 ml-4 pb-10">
        {Object.entries(groupedActivities).map(([date, events]) => (
          <div key={date} className="relative pl-6">
            {/* Date marker */}
            <div className="absolute -left-[29px] top-1 bg-white border-2 border-slate-200 rounded-full p-1 z-10">
              {date === 'today' ? (
                <Icon name="calendar_today" className="text-base text-slate-500" />
              ) : (
                <Icon name="schedule" className="text-base text-slate-500" />
              )}
            </div>

            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {getDateLabel(date)}
            </h4>

            <div className="space-y-4">
              {events.map((event) => (
                <Card key={event.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getActivityIcon(event.type)}
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">
                        {event.title}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">{event.timestamp}</span>
                  </div>

                  {event.description && (
                    <p className="text-sm text-slate-600 mb-3">{event.description}</p>
                  )}

                  {/* Agent Action Details */}
                  {event.type === 'agent_action' && event.agentStatus && (
                    <div className="mb-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon name="smart_toy" className="text-base text-purple-600" />
                          <span className="font-medium text-purple-800 text-sm">
                            {event.agentName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {event.confidenceScore && (
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${
                                event.confidenceScore >= 80
                                  ? 'bg-green-100 text-green-700'
                                  : event.confidenceScore >= 60
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {event.confidenceScore}% confidence
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                              getAgentStatusBadge(event.agentStatus).className
                            }`}
                          >
                            {getAgentStatusBadge(event.agentStatus).label}
                          </span>
                        </div>
                      </div>

                      {event.agentStatus === 'pending_approval' && event.agentActionId && (
                        <Link
                          href={`/agent-approvals/preview?actionId=${event.agentActionId}`}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors mt-2"
                        >
                          <Icon name="open_in_new" className="text-xs" />
                          Review & Approve
                        </Link>
                      )}
                    </div>
                  )}

                  {/* Attachment */}
                  {event.attachment && (
                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-100 max-w-fit">
                      <Icon name="description" className="text-base text-red-500" />
                      <span className="text-xs font-medium text-slate-700">
                        {event.attachment.name}
                      </span>
                    </div>
                  )}

                  {/* Stage Change */}
                  {event.stageChange && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                        {event.stageChange.from}
                      </span>
                      <Icon name="chevron_right" className="text-base text-slate-400" />
                      <span className="px-2 py-0.5 bg-primary/10 text-primary font-medium rounded">
                        {event.stageChange.to}
                      </span>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductsCard({ products, total }: { products: Deal['products']; total: number }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Products
        </h3>
        <button className="w-6 h-6 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors">
          <Icon name="add" className="text-base" />
        </button>
      </div>
      <div className="space-y-3">
        {products.map((product, index) => (
          <div
            key={index}
            className={`flex justify-between items-start text-sm ${
              index > 0 ? 'border-t border-slate-50 pt-3' : ''
            }`}
          >
            <div>
              <p className="font-medium text-slate-900 dark:text-white">{product.name}</p>
              <p className="text-xs text-slate-500">{product.description}</p>
            </div>
            <p className="font-semibold text-slate-900 dark:text-white">
              {formatCurrency(product.price)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-dashed border-slate-200 flex justify-between items-center">
        <span className="text-sm font-medium text-slate-500">Total</span>
        <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
      </div>
    </Card>
  );
}

function NextStepsCard({ steps }: { steps: Deal['nextSteps'] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Next Steps
        </h3>
        <button className="w-6 h-6 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors">
          <Icon name="add" className="text-base" />
        </button>
      </div>
      <div className="space-y-3">
        {steps.map((step) => (
          <label key={step.id} className="flex items-start gap-3 group cursor-pointer">
            <input
              type="checkbox"
              defaultChecked={step.completed}
              className="mt-1 rounded border-slate-300 text-primary focus:ring-primary/50 cursor-pointer"
            />
            <div className="text-sm">
              <p className="font-medium text-slate-700 group-hover:text-primary transition-colors">
                {step.title}
              </p>
              <p
                className={`text-xs mt-0.5 ${
                  step.dueDate.includes('Tomorrow') ? 'text-red-500' : 'text-slate-400'
                }`}
              >
                {step.dueDate}
              </p>
            </div>
          </label>
        ))}
      </div>
    </Card>
  );
}

function FilesCard({ files }: { files: Deal['files'] }) {
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return 'bg-red-50 text-red-600';
      case 'doc':
        return 'bg-blue-50 text-blue-600';
      case 'xls':
        return 'bg-green-50 text-green-600';
      default:
        return 'bg-slate-50 text-slate-600';
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Files
        </h3>
        <button className="w-6 h-6 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors">
          <Icon name="upload" className="text-base" />
        </button>
      </div>
      <div className="space-y-2">
        {files.map((file, index) => (
          <a
            key={index}
            href="#"
            className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors group"
          >
            <div className={`p-1.5 rounded ${getFileIcon(file.type)}`}>
              <Icon name="description" className="text-xl" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate group-hover:text-primary">
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {file.size} &bull; {file.date}
              </p>
            </div>
          </a>
        ))}
      </div>
    </Card>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function DealDetailPage() {
  const params = useParams();
  const dealId = params.id as string;

  // In production, fetch deal data based on dealId
  const deal = SAMPLE_DEAL;

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-[#0B1116] p-6 md:p-8">
      <div className=" mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-slate-500">
              <Link href="/deals" className="hover:text-primary transition-colors">
                Deals
              </Link>
              <Icon name="chevron_right" className="text-sm" />
              <span className="text-slate-900 dark:text-slate-200 font-medium">{deal.name}</span>
            </nav>

            {/* Title */}
            <div className="flex items-center gap-3 mt-1">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{deal.name}</h2>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                #{deal.id}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link href={`/deals/${dealId}/forecast`}>
              <Button variant="outline" className="gap-2">
                <Icon name="bar_chart" className="text-base" />
                Forecast
              </Button>
            </Link>
            <Button variant="outline">Lost</Button>
            <Button variant="outline">Edit</Button>
            <Button className="gap-2">
              <Icon name="check" className="text-base" />
              Won
            </Button>
          </div>
        </div>

        {/* Stage Progress */}
        <StageProgress currentStageIndex={deal.stageIndex} probability={deal.probability} />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Sidebar */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <AboutDealCard deal={deal} />
            <StakeholdersCard deal={deal} />
          </div>

          {/* Center - Activity Timeline */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            <ActivityTimeline activities={SAMPLE_ACTIVITIES} dealId={dealId} />
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <ProductsCard products={deal.products} total={deal.value} />
            <NextStepsCard steps={deal.nextSteps} />
            <FilesCard files={deal.files} />
          </div>
        </div>
      </div>
    </main>
  );
}
