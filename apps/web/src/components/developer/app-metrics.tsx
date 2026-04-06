'use client';

import { Card, CardContent, CardHeader, EmptyState } from '@intelliflow/ui';
import type { DeveloperApp } from '@/lib/developer/demo-data';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

interface DailyApiUsage {
  date: string;
  calls: number;
  errors: number;
  avgResponseMs: number;
}

interface AppUsageStats {
  totalCallsThisMonth: number;
  totalCallsLastMonth: number;
  avgResponseMs: number;
  errorRate: number;
  dailyBreakdown: DailyApiUsage[];
}

function generateDailyBreakdown(baseCalls: number, days: number): DailyApiUsage[] {
  const breakdown: DailyApiUsage[] = [];
  const today = new Date('2026-02-24');
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    const variation = 0.7 + Math.sin(i * 0.5) * 0.3;
    const calls = Math.round((baseCalls / days) * variation);
    breakdown.push({
      date: date.toISOString().split('T')[0],
      calls,
      errors: Math.round(calls * 0.012),
      avgResponseMs: 150 + Math.round(Math.sin(i * 0.3) * 50),
    });
  }
  return breakdown;
}

const DEMO_USAGE: Record<string, AppUsageStats> = {
  'app-001': {
    totalCallsThisMonth: 14820,
    totalCallsLastMonth: 12450,
    avgResponseMs: 187,
    errorRate: 0.012,
    dailyBreakdown: generateDailyBreakdown(14820, 30),
  },
  'app-002': {
    totalCallsThisMonth: 0,
    totalCallsLastMonth: 0,
    avgResponseMs: 0,
    errorRate: 0,
    dailyBreakdown: [],
  },
  'app-003': {
    totalCallsThisMonth: 22,
    totalCallsLastMonth: 156,
    avgResponseMs: 341,
    errorRate: 0.041,
    dailyBreakdown: generateDailyBreakdown(22, 30),
  },
};

export interface AppMetricsProps {
  app: DeveloperApp;
}

export function AppMetrics({ app }: Readonly<AppMetricsProps>) {
  const { timezone } = useTimezoneContext();
  const usage = DEMO_USAGE[app.id];

  if (
    !usage ||
    (usage.totalCallsThisMonth === 0 && usage.totalCallsLastMonth === 0 && app.apiKeys.length === 0)
  ) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState entity="insights" phase="passive" />
        </CardContent>
      </Card>
    );
  }

  const maxCalls = Math.max(...usage.dailyBreakdown.map((d) => d.calls), 1);
  const monthChange =
    usage.totalCallsLastMonth > 0
      ? ((usage.totalCallsThisMonth - usage.totalCallsLastMonth) / usage.totalCallsLastMonth) * 100
      : 0;

  const errorBreakdown = [
    { label: 'Auth Errors', pct: 35, color: 'bg-red-500' },
    { label: 'Rate Limited', pct: 25, color: 'bg-yellow-500' },
    { label: 'Server Errors', pct: 20, color: 'bg-orange-500' },
    { label: 'Client Errors', pct: 20, color: 'bg-blue-500' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total API Calls
            </p>
            <p className="text-2xl font-bold mt-1">{usage.totalCallsThisMonth.toLocaleString('en-GB')}</p>
            {monthChange !== 0 && (
              <p className={`text-xs mt-1 ${monthChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {monthChange > 0 ? '+' : ''}
                {monthChange.toFixed(1)}% from last month
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Avg Response Time
            </p>
            <p className="text-2xl font-bold mt-1">{usage.avgResponseMs}ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Error Rate
            </p>
            <p className="text-2xl font-bold mt-1">{(usage.errorRate * 100).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Active Keys
            </p>
            <p className="text-2xl font-bold mt-1">{app.apiKeys.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily API Calls Chart */}
      {usage.dailyBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Daily API Calls</h2>
          </CardHeader>
          <CardContent>
            <div
              className="flex items-end gap-0.5 h-32"
              aria-label="Daily API calls chart"
            >
              {usage.dailyBreakdown.map((day) => {
                const pct = Math.max((day.calls / maxCalls) * 100, 2);
                return (
                  <div
                    key={day.date}
                    className="flex-1 bg-primary/80 hover:bg-primary rounded-t transition-colors group relative"
                    style={{ height: `${pct}%` }}
                    title={`${day.date}: ${day.calls} calls`}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow whitespace-nowrap z-10">
                      {day.calls} calls
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Breakdown */}
      {usage.errorRate > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Error Breakdown</h2>
          </CardHeader>
          <CardContent>
            <div
              className="flex h-4 rounded overflow-hidden"
              aria-label="Error breakdown by category"
            >
              {errorBreakdown.map((segment) => (
                <div
                  key={segment.label}
                  className={`${segment.color}`}
                  style={{ width: `${segment.pct}%` }}
                  title={`${segment.label}: ${segment.pct}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs">
              {errorBreakdown.map((segment) => (
                <div key={segment.label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded ${segment.color}`} />
                  <span>
                    {segment.label} ({segment.pct}%)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Key Usage Table */}
      {app.apiKeys.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Per-Key Usage</h2>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Key Name</th>
                  <th className="text-left py-2 px-3 font-medium">Requests</th>
                  <th className="text-left py-2 px-3 font-medium">Last Used</th>
                </tr>
              </thead>
              <tbody>
                {app.apiKeys.map((key, idx) => (
                  <tr key={key.id} className="border-b last:border-0">
                    <td className="py-2 px-3">{key.name}</td>
                    <td className="py-2 px-3">
                      {Math.round(
                        usage.totalCallsThisMonth *
                          (idx === 0 ? 0.65 : 0.35 / Math.max(app.apiKeys.length - 1, 1))
                      ).toLocaleString('en-GB')}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {key.lastUsed ? new Date(key.lastUsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone }) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
