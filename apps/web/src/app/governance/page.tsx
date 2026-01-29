'use client';

import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { useEffect, useState } from 'react';

interface ADRStats {
  total: number;
  byStatus: Record<string, number>;
  validationSummary: { valid: number; withErrors: number; withWarnings: number };
}

const governanceCards = [
  {
    title: 'Compliance Dashboard',
    description: 'Monitor adherence to ISO 27001, ISO 42001, ISO 14001, and GDPR standards',
    href: '/governance/compliance',
    icon: 'verified_user',
    color: 'bg-emerald-500',
  },
  {
    title: 'ADR Registry',
    description: 'Architecture Decision Records and their compliance mappings',
    href: '/governance/adr',
    icon: 'architecture',
    color: 'bg-purple-500',
  },
  {
    title: 'Policies',
    description: 'Security policies, data protection guidelines, and procedures',
    href: '/governance/policies',
    icon: 'description',
    color: 'bg-blue-500',
  },
];

const recentActivity = [
  {
    action: 'ISO 27001 audit completed',
    description: 'System automatically verified 14 controls.',
    time: '2 hours ago',
    icon: 'check_circle',
    iconColor: 'text-emerald-500',
  },
  {
    action: 'New Risk Detected: AI Model Bias',
    description: 'Flagged by automated monitoring in ISO 42001 module.',
    time: 'Yesterday, 4:30 PM',
    icon: 'warning',
    iconColor: 'text-amber-500',
  },
  {
    action: 'GDPR Policy Updated',
    description: 'Version 2.4 published by Legal Team.',
    time: 'Oct 20, 2023',
    icon: 'description',
    iconColor: 'text-blue-500',
  },
];

export default function GovernancePage() {
  const [adrStats, setAdrStats] = useState<ADRStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/adr?action=stats');
        const result = await response.json();
        if (result.success) {
          setAdrStats(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch ADR stats:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="p-8">
      <div className="max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Governance</h1>
          <p className="text-muted-foreground mt-1">
            Compliance monitoring, architecture decisions, and policy management
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">
                  verified_user
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall Score</p>
                <p className="text-2xl font-bold text-foreground">74.6%</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">
                  architecture
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active ADRs</p>
                <p className="text-2xl font-bold text-foreground">
                  {loading ? '...' : adrStats?.total || 0}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
                  description
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Policies</p>
                <p className="text-2xl font-bold text-foreground">23</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">
                  warning
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open Issues</p>
                <p className="text-2xl font-bold text-foreground">
                  {loading ? '...' : adrStats?.validationSummary.withErrors || 0}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Governance Cards */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          {governanceCards.map((card) => (
            <Link key={card.href} href={card.href} className="group">
              <Card className="p-6 h-full hover:border-primary hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center`}
                  >
                    <span className="material-symbols-outlined text-2xl text-white">
                      {card.icon}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {card.title}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">{card.description}</p>
                <div className="mt-4 flex items-center gap-1 text-primary text-sm font-medium">
                  <span>Open</span>
                  <span className="material-symbols-outlined text-base group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Recent Activity */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Recent Governance Activity</h2>
            <button className="text-sm text-primary hover:underline">View All</button>
          </div>
          <div className="space-y-4">
            {recentActivity.map((activity, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`material-symbols-outlined ${activity.iconColor}`}>
                    {activity.icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{activity.action}</p>
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
