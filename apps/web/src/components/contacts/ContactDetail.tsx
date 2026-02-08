'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Tabs, TabsList, TabsTrigger, TabsContent, ChurnRiskCard, NextBestActionCard, type ChurnRiskData, type NextBestActionData, type ChurnRiskLevel, type NBAActionType, type NBAPriority } from '@intelliflow/ui';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type TabId = 'overview' | 'activity' | 'deals' | 'tickets' | 'documents' | 'notes' | 'ai-insights';

type ContactStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

interface ContactOwner {
  name: string;
  title?: string;
  avatarUrl?: string;
}

interface ContactAccount {
  id: string;
  name: string;
  industry?: string | null;
}

interface ContactMetrics {
  totalDeals: number;
  totalValue: number;
  openTasks: number;
  emailsSent: number;
}

export interface ContactDetailContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  department: string;
  status: ContactStatus;
  createdAt: string;
  lastContactedAt: string;
  avatarUrl?: string;
  owner: ContactOwner;
  account: ContactAccount | null;
  metrics: ContactMetrics;
  aiInsight?: {
    conversionProbability: number;
    lifetimeValue: number;
    churnRisk: string;
    nextBestAction: string | null;
    sentiment: string | null;
    engagementScore: number;
    recommendations: string[];
    sentimentTrend: string | null;
    lastEngagementDays: number;
  } | null;
}

export interface ContactDetailProps {
  contact: ContactDetailContact;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onEdit: () => void;
  onEmail: () => void;
  onCall: () => void;
  tabCounts?: Record<string, number>;
  children?: React.ReactNode;
}

// ─── Status Badge ───────────────────────────────────────────────────────────────

const statusConfig: Record<ContactStatus, { label: string; className: string; icon: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400',
    icon: 'check_circle',
  },
  INACTIVE: {
    label: 'Inactive',
    className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
    icon: 'pause_circle',
  },
  ARCHIVED: {
    label: 'Archived',
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
    icon: 'archive',
  },
};

// ─── Tabs ───────────────────────────────────────────────────────────────────────

const tabDefs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'deals', label: 'Deals' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'documents', label: 'Documents' },
  { id: 'notes', label: 'Notes' },
  { id: 'ai-insights', label: 'AI Insights' },
];

// ─── AI Insight Transforms ──────────────────────────────────────────────────────

function toChurnRiskData(insight: ContactDetailContact['aiInsight']): ChurnRiskData | null {
  if (!insight) return null;
  const levelMap: Record<string, ChurnRiskLevel> = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL', MINIMAL: 'MINIMAL' };
  const level = levelMap[insight.churnRisk] || 'LOW';
  const scoreMap: Record<ChurnRiskLevel, number> = { CRITICAL: 90, HIGH: 70, MEDIUM: 50, LOW: 25, MINIMAL: 10 };
  const slaMap: Record<ChurnRiskLevel, number> = { CRITICAL: 24, HIGH: 48, MEDIUM: 168, LOW: 336, MINIMAL: 720 };
  return {
    score: scoreMap[level],
    level,
    confidence: 0.85,
    slaHours: slaMap[level],
    trend: insight.sentimentTrend === 'IMPROVING' ? 'IMPROVING' : insight.sentimentTrend === 'DECLINING' ? 'DECLINING' : 'STABLE',
    factors: [
      { factor: 'Engagement Score', impact: insight.engagementScore < 30 ? 'HIGH' : insight.engagementScore < 60 ? 'MEDIUM' : 'LOW', value: `${insight.engagementScore}%` },
      { factor: 'Days Since Contact', impact: insight.lastEngagementDays > 30 ? 'HIGH' : insight.lastEngagementDays > 14 ? 'MEDIUM' : 'LOW', value: `${insight.lastEngagementDays} days` },
    ],
  };
}

function toNBAData(insight: ContactDetailContact['aiInsight']): NextBestActionData | null {
  if (!insight?.nextBestAction) return null;
  const text = insight.nextBestAction.toUpperCase();
  let actionType: NBAActionType = 'WAIT';
  if (text.includes('CALL')) actionType = 'CALL';
  else if (text.includes('EMAIL')) actionType = 'EMAIL';
  else if (text.includes('MEET')) actionType = 'MEETING';
  else if (text.includes('PROPOSAL')) actionType = 'SEND_PROPOSAL';
  else if (text.includes('DEMO')) actionType = 'SCHEDULE_DEMO';

  let priority: NBAPriority = 'MEDIUM';
  if (insight.churnRisk === 'HIGH' || insight.churnRisk === 'CRITICAL') priority = 'HIGH';
  else if (insight.churnRisk === 'LOW' || insight.churnRisk === 'MINIMAL') priority = 'LOW';

  return {
    actionType,
    title: insight.nextBestAction,
    priority,
    rationale: `Based on ${insight.engagementScore}% engagement and ${insight.churnRisk} churn risk.`,
    confidence: 0.85,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function ContactDetail({
  contact,
  activeTab,
  onTabChange,
  onEdit,
  onEmail,
  onCall,
  tabCounts = {},
  children,
}: ContactDetailProps) {
  const fullName = `${contact.firstName} ${contact.lastName}`;
  const status = statusConfig[contact.status] || statusConfig.ACTIVE;

  const churnRiskData = toChurnRiskData(contact.aiInsight);
  const nbaData = toNBAData(contact.aiInsight);

  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
            <Link href="/contacts" className="hover:text-primary">Contacts</Link>
            <span className="material-symbols-outlined text-xs" aria-hidden="true">chevron_right</span>
            <span className="font-medium text-slate-900 dark:text-white">{fullName}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{fullName}</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onEdit}
            aria-label="Edit profile"
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
            Edit Profile
          </button>
          <button
            onClick={onEmail}
            aria-label={`Send email to ${fullName}`}
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">mail</span>
            Email
          </button>
          <button
            onClick={onCall}
            aria-label={`Call ${fullName}`}
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-blue-600 transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">phone</span>
            Log Call
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar - Profile Card */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          <Card className="overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-blue-100 to-blue-50 dark:from-slate-800 dark:to-slate-800" />
            <div className="px-5 pb-6 relative">
              <div className="relative -mt-10 mb-3">
                <div className="w-20 h-20 rounded-full border-4 border-white dark:border-slate-900 bg-slate-200 overflow-hidden shadow-sm flex items-center justify-center text-2xl font-bold text-slate-500">
                  {contact.avatarUrl ? (
                    <img src={contact.avatarUrl} alt={fullName} className="w-full h-full object-cover" />
                  ) : (
                    <span>{contact.firstName[0]}{contact.lastName[0]}</span>
                  )}
                </div>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{fullName}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{contact.title}</p>
              {contact.account && (
                <Link href={`/accounts/${contact.account.id}`} className="text-primary text-sm font-medium mt-1 hover:underline flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">domain</span>
                  {contact.account.name}
                </Link>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${status.className}`}>
                  <span className="material-symbols-outlined text-xs" aria-hidden="true">{status.icon}</span>
                  {status.label}
                </span>
              </div>
              <div className="space-y-3 mt-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 mt-0.5" aria-hidden="true">mail</span>
                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold">Email</span>
                    <a href={`mailto:${contact.email}`} className="block text-sm text-slate-700 dark:text-slate-300 hover:text-primary break-all">{contact.email}</a>
                  </div>
                </div>
                {contact.phone && (
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-slate-400 mt-0.5" aria-hidden="true">phone</span>
                    <div>
                      <span className="text-xs text-slate-400 uppercase font-semibold">Phone</span>
                      <a href={`tel:${contact.phone}`} className="block text-sm text-slate-700 dark:text-slate-300 hover:text-primary">{contact.phone}</a>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">${(contact.metrics.totalValue / 1000).toFixed(0)}k</p>
                  <p className="text-xs text-slate-500">Total Value</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{contact.metrics.totalDeals}</p>
                  <p className="text-xs text-slate-500">Deals</p>
                </div>
              </div>
            </div>
          </Card>
          {/* Contact Owner */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase mb-3 tracking-wider">Contact Owner</h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-500">
                {contact.owner.name[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{contact.owner.name}</p>
                {contact.owner.title && <p className="text-xs text-slate-500">{contact.owner.title}</p>}
              </div>
            </div>
          </Card>
        </aside>

        {/* Center Content - Tabs */}
        <section className="lg:col-span-9 flex flex-col gap-6">
          <Card>
            <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as TabId)}>
              <TabsList aria-label="Contact information sections" className="w-full justify-start border-b border-slate-200 dark:border-slate-800 px-2 rounded-none bg-transparent h-auto">
                {tabDefs.map((tab) => {
                  const count = tabCounts[tab.id];
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="px-4 py-4 text-sm font-semibold border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none bg-transparent shadow-none"
                    >
                      {tab.label}
                      {count !== undefined && count > 0 && (
                        <>
                          <span className="sr-only">, {count} items</span>
                          <span aria-hidden="true" className="ml-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">{count}</span>
                        </>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {/* Tab Content — AI Insights handled internally, rest passed as children */}
              <TabsContent value="ai-insights" tabIndex={0} className="p-6">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {churnRiskData && <ChurnRiskCard data={churnRiskData} title="Churn Risk Assessment" showFactors showConfidence showSLA />}
                    {nbaData && <NextBestActionCard data={nbaData} title="Recommended Action" showRationale showConfidence />}
                  </div>
                  {contact.aiInsight && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Card className="p-4">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{contact.aiInsight.conversionProbability}%</p>
                        <p className="text-xs text-slate-500">Conversion Probability</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">${(contact.aiInsight.lifetimeValue / 100000).toFixed(0)}k</p>
                        <p className="text-xs text-slate-500">Est. Lifetime Value</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{contact.aiInsight.engagementScore}%</p>
                        <p className="text-xs text-slate-500">Engagement Score</p>
                      </Card>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Pass-through for other tab content */}
              {children}
            </Tabs>
          </Card>
        </section>
      </div>
    </div>
  );
}
