'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, MetricCard, StaleIndicator } from './shared';

interface SecurityMetrics {
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    total: number;
  };
  lastScan: string | null;
  baseline: {
    critical: number;
    high: number;
    date: string;
  } | null;
  scanHistory: Array<{
    date: string;
    total: number;
    critical: number;
  }>;
  compliance: {
    owasp_top10: boolean;
    dependency_check: boolean;
    secret_scan: boolean;
  };
}

export default function SecurityDashboard() {
  const [data, setData] = useState<SecurityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/tracking/security');
      if (!response.ok) throw new Error('Failed to fetch security metrics');
      const result = await response.json();
      setData(result.metrics);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      const response = await fetch('/api/tracking/security', { method: 'POST' });
      if (!response.ok) throw new Error('Scan failed');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" className="animate-spin text-blue-500" size="2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
        <div className="flex items-center gap-2">
          <Icon name="error" size="lg" />
          <span>Error: {error}</span>
        </div>
        <button
          onClick={fetchData}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const vulns = data?.vulnerabilities ?? { critical: 0, high: 0, moderate: 0, low: 0, total: 0 };
  const hasVulnerabilities = vulns.total > 0;
  const hasCritical = vulns.critical > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="shield" className={hasCritical ? 'text-red-400' : 'text-green-400'} size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-white">Security Dashboard</h3>
            {data?.lastScan && (
              <StaleIndicator
                lastUpdated={data.lastScan}
                thresholdMinutes={10080}
                showTime
              />
            )}
          </div>
        </div>
        <RefreshButton
          onRefresh={handleScan}
          label={scanning ? 'Scanning...' : 'Run Scan'}
          disabled={scanning}
        />
      </div>

      {/* Security Status Banner */}
      <div className={`rounded-lg p-4 border ${
        hasCritical
          ? 'bg-red-500/10 border-red-500/30'
          : hasVulnerabilities
          ? 'bg-yellow-500/10 border-yellow-500/30'
          : 'bg-green-500/10 border-green-500/30'
      }`}>
        <div className="flex items-center gap-3">
          <Icon
            name={hasCritical ? 'gpp_maybe' : hasVulnerabilities ? 'shield' : 'verified_user'}
            className={hasCritical ? 'text-red-400' : hasVulnerabilities ? 'text-yellow-400' : 'text-green-400'}
            size="2xl"
          />
          <div>
            <div className={`text-lg font-semibold ${
              hasCritical ? 'text-red-400' : hasVulnerabilities ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {hasCritical
                ? `${vulns.critical} Critical Vulnerabilities Found`
                : hasVulnerabilities
                ? `${vulns.total} Vulnerabilities Found`
                : 'No Vulnerabilities Detected'}
            </div>
            <div className="text-sm text-gray-400">
              {hasCritical
                ? 'Immediate action required - critical security issues detected'
                : hasVulnerabilities
                ? 'Review and address vulnerabilities as appropriate'
                : 'Your dependencies are secure'}
            </div>
          </div>
        </div>
      </div>

      {/* Vulnerability Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard
          title="Total"
          value={vulns.total}
          icon="shield"
          variant={vulns.total > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          title="Critical"
          value={vulns.critical}
          icon="report"
          variant={vulns.critical > 0 ? 'error' : 'success'}
        />
        <MetricCard
          title="High"
          value={vulns.high}
          icon="warning"
          variant={vulns.high > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          title="Moderate"
          value={vulns.moderate}
          icon="info"
          variant={vulns.moderate > 0 ? 'info' : 'default'}
        />
        <MetricCard
          title="Low"
          value={vulns.low}
          icon="remove_circle"
          variant="default"
        />
      </div>

      {/* Baseline Comparison */}
      {data?.baseline && (
        <div className="bg-gray-700/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <Icon name="difference" size="base" />
            Baseline Comparison (from {new Date(data.baseline.date).toLocaleDateString()})
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <span className="text-gray-400">Critical:</span>
              <span className="font-mono text-white">{data.baseline.critical}</span>
              {vulns.critical !== data.baseline.critical && (
                <span className={`text-sm ${vulns.critical > data.baseline.critical ? 'text-red-400' : 'text-green-400'}`}>
                  {vulns.critical > data.baseline.critical ? '+' : ''}{vulns.critical - data.baseline.critical}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400">High:</span>
              <span className="font-mono text-white">{data.baseline.high}</span>
              {vulns.high !== data.baseline.high && (
                <span className={`text-sm ${vulns.high > data.baseline.high ? 'text-red-400' : 'text-green-400'}`}>
                  {vulns.high > data.baseline.high ? '+' : ''}{vulns.high - data.baseline.high}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scan History */}
      {data?.scanHistory && data.scanHistory.length > 0 && (
        <div className="bg-gray-700/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <Icon name="history" size="base" />
            Scan History
          </h4>
          <div className="space-y-2">
            {data.scanHistory.slice(0, 5).map((scan, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  {new Date(scan.date).toLocaleString()}
                </span>
                <div className="flex items-center gap-4">
                  <span className={`${scan.critical > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {scan.critical} critical
                  </span>
                  <span className="text-gray-300">{scan.total} total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compliance Checks */}
      <div className="bg-gray-700/30 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
          <Icon name="assignment_turned_in" size="base" />
          Compliance Status
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            data?.compliance.owasp_top10
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            <Icon
              name={data?.compliance.owasp_top10 ? 'check_circle' : 'cancel'}
              className={data?.compliance.owasp_top10 ? 'text-green-400' : 'text-red-400'}
              size="lg"
            />
            <span className="text-white">OWASP Top 10</span>
          </div>
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            data?.compliance.dependency_check
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            <Icon
              name={data?.compliance.dependency_check ? 'check_circle' : 'cancel'}
              className={data?.compliance.dependency_check ? 'text-green-400' : 'text-red-400'}
              size="lg"
            />
            <span className="text-white">Dependency Check</span>
          </div>
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            data?.compliance.secret_scan
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            <Icon
              name={data?.compliance.secret_scan ? 'check_circle' : 'cancel'}
              className={data?.compliance.secret_scan ? 'text-green-400' : 'text-red-400'}
              size="lg"
            />
            <span className="text-white">Secret Scan</span>
          </div>
        </div>
      </div>
    </div>
  );
}
