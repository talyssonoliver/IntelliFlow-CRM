'use client';

import { useEffect, useState } from 'react';
import { Card } from '@intelliflow/ui';

type ServiceStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage';

interface Service {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  uptime: number;
}

interface StatusMonitorProps {
  services: Service[];
  refreshInterval?: number;
}

// Generate uptime bars for the last 90 days
function generateUptimeBars(uptime: number): { day: number; status: ServiceStatus }[] {
  const bars: { day: number; status: ServiceStatus }[] = [];

  for (let i = 0; i < 90; i++) {
    // Simulate historical uptime based on current uptime percentage
    const random = Math.random();
    let status: ServiceStatus = 'operational';

    if (uptime < 99.9 && random > 0.95) {
      status = 'degraded';
    } else if (uptime < 99.5 && random > 0.98) {
      status = 'partial_outage';
    }

    bars.push({ day: i, status });
  }

  return bars;
}

function getStatusColor(status: ServiceStatus): string {
  switch (status) {
    case 'operational':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    case 'partial_outage':
      return 'bg-orange-500';
    case 'major_outage':
      return 'bg-red-500';
  }
}

export function StatusMonitor({
  services,
  refreshInterval = 30000,
}: StatusMonitorProps) {
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRefreshing(true);
      // Simulate refresh
      setTimeout(() => {
        setLastUpdated(new Date());
        setIsRefreshing(false);
      }, 500);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  return (
    <div className="space-y-6">
      {/* Uptime Overview */}
      <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            90-Day Uptime
          </h3>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            {isRefreshing && (
              <span className="material-symbols-outlined animate-spin text-base" aria-hidden="true">
                refresh
              </span>
            )}
            <span>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {services.slice(0, 4).map((service) => {
            const bars = generateUptimeBars(service.uptime);

            return (
              <div key={service.id}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {service.name}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {service.uptime}%
                  </span>
                </div>
                <div
                  className="flex gap-0.5"
                  role="img"
                  aria-label={`${service.name} uptime chart: ${service.uptime}% over 90 days`}
                >
                  {bars.map((bar, idx) => (
                    <div
                      key={idx}
                      className={`h-8 w-1 rounded-sm ${getStatusColor(bar.status)} opacity-80 hover:opacity-100 transition-opacity`}
                      title={`Day ${90 - idx}: ${bar.status.replace('_', ' ')}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-green-500" aria-hidden="true" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Operational</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-yellow-500" aria-hidden="true" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Degraded</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-orange-500" aria-hidden="true" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Partial Outage</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-red-500" aria-hidden="true" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Major Outage</span>
          </div>
        </div>
      </Card>

      {/* Current Status Summary */}
      <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Current Response Times
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">45ms</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">API p50</p>
          </div>
          <div className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">89ms</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">API p95</p>
          </div>
          <div className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">156ms</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">API p99</p>
          </div>
          <div className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">99.99%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Success Rate</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
