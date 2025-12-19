'use client';

import { Card } from '@intelliflow/ui';
import { TrendingUp, TrendingDown, Users, Target, BarChart, CheckCircle } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Welcome to your AI-powered CRM dashboard</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Leads"
          value="--"
          trend="+12%"
          icon={Users}
          description="from last month"
        />
        <StatCard
          title="Qualified"
          value="--"
          trend="+8%"
          icon={Target}
          description="from last month"
        />
        <StatCard
          title="Avg Score"
          value="--"
          trend="+5%"
          icon={BarChart}
          description="from last month"
        />
        <StatCard
          title="Converted"
          value="--"
          trend="+15%"
          icon={CheckCircle}
          description="from last month"
        />
      </div>

      {/* Content Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Leads</h3>
          <div className="flex items-center justify-center h-[300px] border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">Connect API to display recent leads...</p>
          </div>
        </Card>

        <Card className="col-span-3 p-6">
          <h3 className="text-lg font-semibold mb-4">AI Insights</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-2 w-2 rounded-full bg-blue-500 mt-2" />
              <div className="flex-1">
                <p className="text-sm font-medium">AI-powered recommendations</p>
                <p className="text-xs text-muted-foreground mt-1">
                  will appear here once configured
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-2 w-2 rounded-full bg-violet-500 mt-2" />
              <div className="flex-1">
                <p className="text-sm font-medium">Lead scoring insights</p>
                <p className="text-xs text-muted-foreground mt-1">
                  automatic qualification coming soon
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-2 w-2 rounded-full bg-orange-500 mt-2" />
              <div className="flex-1">
                <p className="text-sm font-medium">Workflow automation</p>
                <p className="text-xs text-muted-foreground mt-1">smart follow-ups and responses</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Additional Section */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Activity Overview</h3>
        <div className="flex items-center justify-center h-[200px] border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">Activity timeline will be displayed here</p>
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  trend,
  icon: Icon,
  description,
}: {
  title: string;
  value: string;
  trend: string;
  icon: any;
  description: string;
}) {
  const isPositive = trend.startsWith('+');

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold">{value}</p>
        <div className="flex items-center gap-1 mt-1">
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
          <p className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>{trend}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </Card>
  );
}
