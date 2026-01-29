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
    <>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/dashboard" className="hover:text-primary">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Analytics</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            Analytics
          </h1>
          <p className="text-muted-foreground text-base">
            AI-powered insights and sales pipeline analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 group"
            >
              <span className="material-symbols-outlined text-lg transition-transform group-hover:scale-110">download</span>
              Export
              <span className={`material-symbols-outlined text-sm transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {/* Export Menu */}
            {exportMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden">
                <div className="py-1">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                    CSV Export
                  </div>
                  <button
                    onClick={() => handleExportCSV('metrics')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg text-muted-foreground">table_chart</span>
                    Metrics Only
                  </button>
                  <button
                    onClick={() => handleExportCSV('pipeline')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg text-muted-foreground">waterfall_chart</span>
                    Pipeline Only
                  </button>
                  <button
                    onClick={() => handleExportCSV('all')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg text-muted-foreground">download</span>
                    All Data (CSV)
                  </button>

                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-t border-b border-border mt-1">
                    PDF Export
                  </div>
                  <button
                    onClick={handleExportPDF}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg text-destructive">picture_as_pdf</span>
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
        <Card className="lg:col-span-2 p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              Pipeline Overview
            </h3>
            <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
              <span className="material-symbols-outlined">more_horiz</span>
            </button>
          </div>

          {/* Pipeline Stages */}
          <div className="space-y-4">
            <PipelineStageBar
              name="Qualification"
              value="$12,400"
              deals={8}
              percentage={15}
              color="bg-primary"
            />
            <PipelineStageBar
              name="Proposal"
              value="$34,200"
              deals={12}
              percentage={40}
              color="bg-[#6366f1]"
            />
            <PipelineStageBar
              name="Negotiation"
              value="$120,000"
              deals={4}
              percentage={25}
              color="bg-warning"
            />
            <PipelineStageBar
              name="Closed Won"
              value="$40,000"
              deals={2}
              percentage={20}
              color="bg-success"
            />
          </div>
        </Card>

        {/* AI Recommendations */}
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              AI Recommendations
            </h3>
            <Link href="/ai/insights" className="text-sm text-primary hover:underline">
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
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              Revenue Trend
            </h3>
            <select className="px-2 py-1 text-sm border border-border rounded bg-background text-foreground">
              <option>Last 6 months</option>
              <option>Last 12 months</option>
            </select>
          </div>
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-border rounded-lg">
            <div className="text-center">
              <span className="material-symbols-outlined text-4xl text-muted-foreground mb-2">
                bar_chart
              </span>
              <p className="text-muted-foreground">Chart visualization will be integrated here</p>
            </div>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              Recent Activity
            </h3>
            <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
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
    </>
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
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary">{icon}</span>
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground mb-1">{value}</p>
      <div className="flex items-center gap-1">
        <span
          className={`inline-flex items-center text-sm font-medium ${
            isPositiveTrend ? 'text-success' : 'text-destructive'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {isPositiveTrend ? 'trending_up' : 'trending_down'}
          </span>
          {trend}
        </span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
    </Card>
  );
}

function PipelineStageBar({
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
        <span className="text-sm font-medium text-foreground">{name}</span>
        <span className="text-sm text-muted-foreground">
          {value} ({deals} Deals)
        </span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
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
    high: 'bg-destructive/10 border-destructive/20',
    medium: 'bg-warning/10 border-warning/20',
    low: 'bg-success/10 border-success/20',
  };

  const iconColors = {
    high: 'text-destructive',
    medium: 'text-warning',
    low: 'text-success',
  };

  return (
    <div className={`p-3 rounded-lg border ${priorityStyles[priority]}`}>
      <div className="flex items-start gap-3">
        <span className={`material-symbols-outlined ${iconColors[priority]}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
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
    note: { color: 'bg-primary' },
    email: { color: 'bg-muted-foreground' },
    meeting: { color: 'bg-success' },
  };

  const { color } = typeIcons[type];

  return (
    <div className="flex items-start gap-3">
      <div className={`w-2 h-2 rounded-full ${color} mt-2`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          <span className="font-medium">{user}</span> {action}{' '}
          <Link href="#" className="text-primary hover:underline">
            {target}
          </Link>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{time}</p>
      </div>
    </div>
  );
}
