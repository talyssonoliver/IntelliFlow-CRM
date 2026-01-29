'use client';

import { Card } from '@intelliflow/ui';

interface ComplianceCardProps {
  title: string;
  subtitle: string;
  icon: string;
  score: number;
  trend: number;
  status: 'compliant' | 'critical' | 'attention';
  details: { label: string; value: string }[];
}

function ComplianceCard({
  title,
  subtitle,
  icon,
  score,
  trend,
  status,
  details,
}: ComplianceCardProps) {
  const statusConfig = {
    compliant: {
      badge: 'Compliant',
      badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      dotClass: 'bg-emerald-500 animate-pulse',
      iconBg: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      progressColor: 'bg-emerald-500',
    },
    critical: {
      badge: 'Critical',
      badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
      dotClass: 'bg-red-500',
      iconBg: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      progressColor: 'bg-red-500',
    },
    attention: {
      badge: 'Attention',
      badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      dotClass: 'bg-amber-500',
      iconBg: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      progressColor: 'bg-amber-500',
    },
  };

  const config = statusConfig[status];

  return (
    <Card className="p-6 h-full hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${config.iconBg} ${config.iconColor} flex items-center justify-center`}>
            <span className="material-symbols-outlined">{icon}</span>
          </div>
          <div>
            <h3 className="font-bold text-foreground text-lg">{title}</h3>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{subtitle}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${config.badgeClass} border`}>
          <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
          {config.badge}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-4xl font-bold text-foreground">{score}%</span>
        <span className={`text-sm font-medium flex items-center ${
          trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : 'text-muted-foreground'
        }`}>
          <span className="material-symbols-outlined text-base">
            {trend > 0 ? 'trending_up' : trend < 0 ? 'trending_down' : 'remove'}
          </span>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      </div>

      <div className="w-full bg-muted rounded-full h-2.5 mb-6 overflow-hidden">
        <div className={`${config.progressColor} h-2.5 rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm border-t border-border pt-4">
        {details.map((detail, index) => (
          <div key={index}>
            <p className="text-muted-foreground mb-0.5">{detail.label}</p>
            <p className="font-semibold text-foreground">{detail.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OverallScoreCard() {
  return (
    <Card className="p-6 bg-slate-900 dark:bg-slate-800 border-slate-700 relative overflow-hidden">
      <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-white/10 text-white flex items-center justify-center backdrop-blur-sm">
            <span className="material-symbols-outlined">analytics</span>
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">Overall Score</h3>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Compliance Maturity</p>
          </div>
        </div>

        <div className="flex items-center justify-center py-4">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 36 36">
              <path
                className="text-slate-700"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="text-primary"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeDasharray="74.6, 100"
                strokeLinecap="round"
                strokeWidth="3"
                style={{ filter: 'drop-shadow(0 0 10px rgba(19, 127, 236, 0.5))' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-3xl font-bold text-white">74.6</span>
              <span className="text-xs text-slate-400">Score</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm pt-4 mt-2 border-t border-white/10">
          <div className="text-center border-r border-white/10">
            <p className="text-slate-400 mb-0.5 text-xs">Quarterly Trend</p>
            <p className="font-bold text-white flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-emerald-400 text-base">arrow_upward</span>
              Positive
            </p>
          </div>
          <div className="text-center">
            <p className="text-slate-400 mb-0.5 text-xs">Action Items</p>
            <p className="font-bold text-white">16 Total</p>
          </div>
        </div>

        <button className="w-full mt-5 py-2 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors backdrop-blur-sm">
          Download Full Report
        </button>
      </div>
    </Card>
  );
}

const recentActivity = [
  {
    action: 'Audit completed for ISO 27001',
    description: 'System automatically verified 14 controls.',
    time: '2 hours ago',
    dotColor: 'bg-slate-300 dark:bg-slate-600',
  },
  {
    action: 'New Risk Detected: AI Model Bias',
    description: 'Flagged by automated monitoring in ISO 42001 module.',
    time: 'Yesterday, 4:30 PM',
    dotColor: 'bg-red-400',
  },
  {
    action: 'GDPR Policy Updated',
    description: 'Version 2.4 published by Legal Team.',
    time: 'Oct 20, 2023',
    dotColor: 'bg-slate-300 dark:bg-slate-600',
  },
];

export default function ComplianceDashboardPage() {
  return (
    <div className="p-8">
      <div className="mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Compliance Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Monitor adherence to international standards and internal policies.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-foreground text-sm font-semibold hover:bg-accent transition-colors shadow-sm">
              <span className="material-symbols-outlined text-lg">refresh</span>
              Refresh Data
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-bold shadow-md transition-all active:scale-95">
              <span className="material-symbols-outlined text-lg">download</span>
              Export Report
            </button>
          </div>
        </div>

        {/* Compliance Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          <ComplianceCard
            title="ISO 27001"
            subtitle="InfoSec"
            icon="security"
            score={92}
            trend={2.4}
            status="compliant"
            details={[
              { label: 'Controls Passed', value: '104 / 114' },
              { label: 'Next Audit', value: 'Oct 24, 2023' },
            ]}
          />

          <ComplianceCard
            title="ISO 42001"
            subtitle="AI Mgmt"
            icon="smart_toy"
            score={45}
            trend={-5.1}
            status="critical"
            details={[
              { label: 'Risk Level', value: 'High' },
              { label: 'Open Issues', value: '12 Pending' },
            ]}
          />

          <ComplianceCard
            title="ISO 14001"
            subtitle="Environment"
            icon="eco"
            score={78}
            trend={0}
            status="attention"
            details={[
              { label: 'Cert Status', value: 'Expiring Soon' },
              { label: 'Policy Review', value: 'Required' },
            ]}
          />

          <ComplianceCard
            title="GDPR"
            subtitle="Data Protection"
            icon="gavel"
            score={98}
            trend={0.5}
            status="compliant"
            details={[
              { label: 'Data Incidents', value: '0 Reported' },
              { label: 'DPIA Status', value: 'Up to date' },
            ]}
          />

          <ComplianceCard
            title="ADR Registry"
            subtitle="Architecture"
            icon="architecture"
            score={60}
            trend={-12}
            status="attention"
            details={[
              { label: 'Documentation', value: 'Incomplete' },
              { label: 'Decision Log', value: '4 Pending' },
            ]}
          />

          <OverallScoreCard />
        </div>

        {/* Recent Activity */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-foreground text-lg">Recent Compliance Activity</h3>
            <button className="text-sm font-semibold text-primary hover:underline">
              View All History
            </button>
          </div>
          <div className="space-y-6">
            {recentActivity.map((activity, index) => (
              <div key={index} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full ${activity.dotColor} my-1`} />
                  {index < recentActivity.length - 1 && (
                    <div className="w-px h-full bg-border" />
                  )}
                </div>
                <div className="pb-2">
                  <p className="text-sm font-semibold text-foreground">{activity.action}</p>
                  <p className="text-sm text-muted-foreground">{activity.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
