'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import {
  exportAnalyticsToCSV,
  exportPipelineToCSV,
  exportAnalyticsToPDF,
  type AnalyticsMetric,
  type PipelineStage,
} from '@/lib/export';

const reportViews = [
  { id: 'overview', label: 'Overview', icon: 'dashboard', count: null },
  { id: 'sales', label: 'Sales Reports', icon: 'bar_chart', count: 12 },
  { id: 'pipeline', label: 'Pipeline Analysis', icon: 'trending_up', count: 8 },
  { id: 'forecasts', label: 'Forecasts', icon: 'analytics', count: 4 },
];

const savedReports = [
  { id: 'weekly', label: 'Weekly Summary', color: 'bg-[#137fec]' },
  { id: 'monthly', label: 'Monthly Revenue', color: 'bg-green-500' },
  { id: 'quarterly', label: 'Q4 Performance', color: 'bg-amber-500' },
];

// Analytics data for display and export
const analyticsMetrics: AnalyticsMetric[] = [
  { name: 'Lead Conversion Rate', value: '32%', trend: '+5.2%', period: 'vs last period' },
  { name: 'Average Deal Size', value: '$24,500', trend: '+12%', period: 'vs last period' },
  { name: 'Sales Cycle', value: '28 days', trend: '-3 days', period: 'vs last period' },
  { name: 'AI Score Accuracy', value: '94%', trend: '+2%', period: 'prediction accuracy' },
];

const pipelineStages: PipelineStage[] = [
  { stage: 'Qualification', value: '$12,400', deals: 8, percentage: 15 },
  { stage: 'Proposal', value: '$34,200', deals: 12, percentage: 40 },
  { stage: 'Negotiation', value: '$120,000', deals: 4, percentage: 25 },
  { stage: 'Closed Won', value: '$40,000', deals: 2, percentage: 20 },
];

export default function AnalyticsPage() {
  const [activeView, setActiveView] = useState('overview');
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPeriodLabel = () => {
    const labels: Record<string, string> = {
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
      '90d': 'Last 90 days',
      'ytd': 'Year to date',
    };
    return labels[selectedPeriod] || 'Last 30 days';
  };

  const handleExportCSV = (type: 'metrics' | 'pipeline' | 'all') => {
    const timestamp = new Date().toISOString().split('T')[0];
    if (type === 'metrics' || type === 'all') {
      exportAnalyticsToCSV(analyticsMetrics, `analytics-metrics-${timestamp}`);
    }
    if (type === 'pipeline' || type === 'all') {
      exportPipelineToCSV(pipelineStages, `pipeline-report-${timestamp}`);
    }
    setExportMenuOpen(false);
  };

  const handleExportPDF = () => {
    exportAnalyticsToPDF({
      metrics: analyticsMetrics,
      pipeline: pipelineStages,
      period: getPeriodLabel(),
    });
    setExportMenuOpen(false);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Left Sidebar - Report Views & Saved Reports */}
      <aside className="w-56 border-r border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark flex-shrink-0 hidden lg:block">
        <div className="p-4">
          {/* Report Views */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Report Views
            </h3>
            <nav className="space-y-1">
              {reportViews.map((view) => (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                    activeView === view.id
                      ? 'bg-[#137fec]/10 text-[#137fec] font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">{view.icon}</span>
                    <span>{view.label}</span>
                  </div>
                  {view.count !== null && (
                    <span className="text-xs text-slate-400">{view.count}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Saved Reports */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Saved Reports
            </h3>
            <nav className="space-y-1">
              {savedReports.map((report) => (
                <button
                  key={report.id}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] rounded-lg transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full ${report.color}`} />
                  <span>{report.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Module Settings */}
        <div className="absolute bottom-0 left-0 w-56 p-4 border-t border-border-light dark:border-border-dark">
          <button className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <span className="material-symbols-outlined text-lg">settings</span>
            <span>Report Settings</span>
          </button>
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
          <span className="text-slate-900 dark:text-white font-medium">Analytics</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Analytics
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base">
              AI-powered insights and sales pipeline analytics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="ytd">Year to date</option>
            </select>

            {/* Export Dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="inline-flex items-center gap-2 bg-ds-primary hover:bg-ds-primary-hover text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-ds-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2 group"
              >
                <span className="material-symbols-outlined text-lg transition-transform group-hover:scale-110">download</span>
                Export
                <span className={`material-symbols-outlined text-sm transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>

              {/* Export Menu */}
              {exportMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-surface-dark rounded-lg shadow-lg border border-border-light dark:border-border-dark z-50 overflow-hidden">
                  <div className="py-1">
                    <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-border-light dark:border-border-dark">
                      CSV Export
                    </div>
                    <button
                      onClick={() => handleExportCSV('metrics')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg text-slate-400">table_chart</span>
                      Metrics Only
                    </button>
                    <button
                      onClick={() => handleExportCSV('pipeline')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg text-slate-400">waterfall_chart</span>
                      Pipeline Only
                    </button>
                    <button
                      onClick={() => handleExportCSV('all')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg text-slate-400">download</span>
                      All Data (CSV)
                    </button>

                    <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-t border-b border-border-light dark:border-border-dark mt-1">
                      PDF Export
                    </div>
                    <button
                      onClick={handleExportPDF}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg text-red-500">picture_as_pdf</span>
                      Full Report (PDF)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <MetricCard
            title="Lead Conversion Rate"
            value="32%"
            trend="+5.2%"
            icon="trending_up"
            description="vs last period"
          />
          <MetricCard
            title="Average Deal Size"
            value="$24,500"
            trend="+12%"
            icon="attach_money"
            description="vs last period"
          />
          <MetricCard
            title="Sales Cycle"
            value="28 days"
            trend="-3 days"
            icon="schedule"
            description="vs last period"
            positive
          />
          <MetricCard
            title="AI Score Accuracy"
            value="94%"
            trend="+2%"
            icon="auto_awesome"
            description="prediction accuracy"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid gap-6 lg:grid-cols-3 mb-6">
          {/* Pipeline Overview */}
          <Card className="lg:col-span-2 p-6 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Pipeline Overview
              </h3>
              <button className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <span className="material-symbols-outlined">more_horiz</span>
              </button>
            </div>

            {/* Pipeline Stages */}
            <div className="space-y-4">
              <PipelineStage
                name="Qualification"
                value="$12,400"
                deals={8}
                percentage={15}
                color="bg-[#137fec]"
              />
              <PipelineStage
                name="Proposal"
                value="$34,200"
                deals={12}
                percentage={40}
                color="bg-indigo-500"
              />
              <PipelineStage
                name="Negotiation"
                value="$120,000"
                deals={4}
                percentage={25}
                color="bg-amber-500"
              />
              <PipelineStage
                name="Closed Won"
                value="$40,000"
                deals={2}
                percentage={20}
                color="bg-green-500"
              />
            </div>
          </Card>

          {/* AI Recommendations */}
          <Card className="p-6 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                AI Recommendations
              </h3>
              <Link href="/ai/insights" className="text-sm text-[#137fec] hover:underline">
                View All
              </Link>
            </div>

            <div className="space-y-4">
              <RecommendationItem
                title="Follow up with TechCorp"
                description="High-value opportunity showing engagement signals"
                priority="high"
                icon="priority_high"
              />
              <RecommendationItem
                title="Re-engage Startup.io"
                description="Lead score increased by 15 points"
                priority="medium"
                icon="trending_up"
              />
              <RecommendationItem
                title="Schedule demo for DataCo"
                description="Optimal time window detected"
                priority="low"
                icon="event"
              />
            </div>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue Chart Placeholder */}
          <Card className="p-6 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Revenue Trend
              </h3>
              <select className="px-2 py-1 text-sm border border-border-light dark:border-border-dark rounded bg-surface-light dark:bg-surface-dark text-slate-700 dark:text-slate-300">
                <option>Last 6 months</option>
                <option>Last 12 months</option>
              </select>
            </div>
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-border-light dark:border-border-dark rounded-lg">
              <div className="text-center">
                <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2">
                  bar_chart
                </span>
                <p className="text-slate-400">Chart visualization will be integrated here</p>
              </div>
            </div>
          </Card>

          {/* Recent Activity */}
          <Card className="p-6 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Recent Activity
              </h3>
              <button className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <span className="material-symbols-outlined">refresh</span>
              </button>
            </div>

            <div className="space-y-4">
              <ActivityItem
                type="note"
                user="John Doe"
                action="added a note to"
                target="Deal #402"
                time="2 hours ago"
              />
              <ActivityItem
                type="email"
                user="System"
                action="Email sent to"
                target="Mike Ross"
                time="4 hours ago"
              />
              <ActivityItem
                type="meeting"
                user="System"
                action="Meeting scheduled with"
                target="Pearson Specter"
                time="Yesterday at 2:00 PM"
              />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  title,
  value,
  trend,
  icon,
  description,
  positive = true,
}: {
  title: string;
  value: string;
  trend: string;
  icon: string;
  description: string;
  positive?: boolean;
}) {
  const isPositiveTrend = trend.startsWith('+') || (trend.startsWith('-') && !positive);

  return (
    <Card className="p-6 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <div className="w-10 h-10 rounded-lg bg-ds-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-ds-primary">{icon}</span>
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{value}</p>
      <div className="flex items-center gap-1">
        <span
          className={`inline-flex items-center text-sm font-medium ${
            isPositiveTrend ? 'text-green-600' : 'text-red-600'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {isPositiveTrend ? 'trending_up' : 'trending_down'}
          </span>
          {trend}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">{description}</span>
      </div>
    </Card>
  );
}

function PipelineStage({
  name,
  value,
  deals,
  percentage,
  color,
}: {
  name: string;
  value: string;
  deals: number;
  percentage: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-900 dark:text-white">{name}</span>
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {value} ({deals} Deals)
        </span>
      </div>
      <div className="w-full h-2 bg-slate-100 dark:bg-border-dark rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function RecommendationItem({
  title,
  description,
  priority,
  icon,
}: {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  icon: string;
}) {
  const priorityStyles = {
    high: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
    medium: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
    low: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
  };

  const iconColors = {
    high: 'text-red-600',
    medium: 'text-amber-600',
    low: 'text-green-600',
  };

  return (
    <div className={`p-3 rounded-lg border ${priorityStyles[priority]}`}>
      <div className="flex items-start gap-3">
        <span className={`material-symbols-outlined ${iconColors[priority]}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 dark:text-white text-sm">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({
  type,
  user,
  action,
  target,
  time,
}: {
  type: 'note' | 'email' | 'meeting';
  user: string;
  action: string;
  target: string;
  time: string;
}) {
  const typeIcons = {
    note: { icon: 'edit_note', color: 'bg-blue-500' },
    email: { icon: 'mail', color: 'bg-slate-400' },
    meeting: { icon: 'event', color: 'bg-green-500' },
  };

  const { icon, color } = typeIcons[type];

  return (
    <div className="flex items-start gap-3">
      <div className={`w-2 h-2 rounded-full ${color} mt-2`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 dark:text-white">
          <span className="font-medium">{user}</span> {action}{' '}
          <Link href="#" className="text-[#137fec] hover:underline">
            {target}
          </Link>
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{time}</p>
      </div>
    </div>
  );
}
