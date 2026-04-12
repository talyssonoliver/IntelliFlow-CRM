'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, MetricCard, StaleIndicator, TrendSparkline } from './shared';

// --- Interfaces ---

interface VulnerabilityCounts {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  total: number;
}

interface RemediationItem {
  id: string;
  module: string;
  severity: string;
  status: 'open' | 'fixed' | 'waived';
  fixApplied?: string;
}

interface RemediationSummary {
  fixedCount: number;
  openCount: number;
  waiverCount: number;
  mttrHours: number | null;
  items: RemediationItem[];
}

interface ScanProgress {
  dependency_check: string;
  outdated_check: string;
  secret_scan: string;
  sast_scan: string;
}

interface ScanState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  currentStep: string | null;
  progress: ScanProgress;
  errors: string[];
  scanId: string | null;
}

interface SecurityMetrics {
  vulnerabilities: VulnerabilityCounts;
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
    secretLeaks?: number;
    sastVulns?: number;
  }>;
  compliance: {
    owasp_top10: boolean;
    dependency_check: boolean;
    secret_scan: boolean;
    deps_current: boolean;
  };
  outdatedDeps: {
    major: number;
    minor: number;
    patch: number;
    total: number;
    packages: Array<{ name: string; current: string; latest: string; type: string }>;
    lastScan: string | null;
  };
  secretScan: {
    leaksFound: number;
    filesScanned: number;
    lastScan: string | null;
  };
  sastScan: {
    vulnerabilities: number;
    securityHotspots: number;
    securityRating: string;
    available: boolean;
  };
  remediation: RemediationSummary;
}

// --- Exported Pure Helper Functions (for testability) ---

export const STALE_THRESHOLD_MINUTES = 10080; // 7 * 24 * 60

export function getSecurityStatus(vulns: Readonly<VulnerabilityCounts>) {
  const hasCritical = vulns.critical > 0;
  const hasVulnerabilities = vulns.total > 0;
  const vulnOrSafeBannerClass = hasVulnerabilities
    ? 'bg-yellow-50 border-yellow-200'
    : 'bg-green-50 border-green-200';
  const bannerClass = hasCritical ? 'bg-red-50 border-red-200' : vulnOrSafeBannerClass;
  const vulnOrSafeIconName = hasVulnerabilities ? 'shield' : 'verified_user';
  const iconName = hasCritical ? 'gpp_maybe' : vulnOrSafeIconName;
  const vulnOrSafeStatusText = hasVulnerabilities
    ? `${vulns.total} Vulnerabilities Found`
    : 'No Vulnerabilities Detected';
  const statusText = hasCritical
    ? `${vulns.critical} Critical Vulnerabilities Found`
    : vulnOrSafeStatusText;
  return {
    hasCritical,
    hasVulnerabilities,
    bannerClass,
    iconName,
    statusText,
  };
}

export function getComplianceIcon(value: boolean) {
  return {
    icon: value ? 'check_circle' : 'cancel',
    colorClass: value ? 'text-green-600' : 'text-red-500',
  };
}

export function getBaselineDelta(current: number, baseline: number | null) {
  if (baseline === null || current === baseline) {
    return { value: '0', colorClass: '', show: false };
  }
  const diff = current - baseline;
  return {
    value: diff > 0 ? `+${diff}` : `${diff}`,
    colorClass: diff > 0 ? 'text-red-600' : 'text-green-600',
    show: true,
  };
}

export function getScanHistorySlice(
  history: Array<{ date: string; total: number; critical: number }>,
  max: number
) {
  return history.slice(0, max);
}

export function getHistoryItemColor(critical: number) {
  return critical > 0 ? 'text-red-600' : 'text-green-600';
}

export function getVulnerabilityDefaults(data: VulnerabilityCounts | null): VulnerabilityCounts {
  return data ?? { critical: 0, high: 0, moderate: 0, low: 0, total: 0 };
}

export function getScanButtonState(scanning: boolean) {
  return {
    label: scanning ? 'Scanning...' : 'Run Scan',
    disabled: scanning,
  };
}

export function getRemediationSummary(remediation: Readonly<RemediationSummary>) {
  const isEmpty = remediation.items.length === 0;
  return {
    isEmpty,
    emptyMessage: isEmpty ? 'No vulnerabilities to track' : null,
    fixedCount: remediation.fixedCount,
    openCount: remediation.openCount,
    waiverCount: remediation.waiverCount,
    mttrDisplay: remediation.mttrHours === null ? 'N/A' : `${remediation.mttrHours}h`,
  };
}

export function getScanProgressDisplay(scanState: ScanState | null) {
  if (scanState?.status !== 'running') {
    return { showBanner: false, currentStep: null, isRunning: false };
  }
  return {
    showBanner: true,
    currentStep: scanState.currentStep,
    isRunning: true,
  };
}

export function getLoadingState(
  loading: boolean,
  data: SecurityMetrics | null,
  errors: Record<string, string | null>
) {
  const generalError = errors.general || null;
  if (generalError) {
    return { showLoading: false, showError: true, showEmpty: false, errorMessage: generalError };
  }
  if (loading && !data) {
    return { showLoading: true, showError: false, showEmpty: false, errorMessage: null };
  }
  if (!loading && !data) {
    return { showLoading: false, showError: false, showEmpty: true, errorMessage: null };
  }
  return { showLoading: false, showError: false, showEmpty: false, errorMessage: null };
}

// --- Severity badge helper ---

function getPackageTypeBadgeClass(type: string): string {
  if (type === 'major') return 'bg-red-100 text-red-700';
  if (type === 'minor') return 'bg-yellow-100 text-yellow-700';
  return 'bg-blue-100 text-blue-700';
}

function getSeverityBadgeClass(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'moderate':
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'fixed':
      return 'bg-green-100 text-green-800';
    case 'open':
      return 'bg-red-100 text-red-800';
    case 'waived':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// --- Utility: format a date string for display ---

function formatBaselineDate(dateStr: string): string {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
}

// --- Security Status Banner Content (extracted IIFE) ---

interface SecurityStatusBannerContentProps {
  status: ReturnType<typeof getSecurityStatus>;
}

function SecurityStatusBannerContent({ status }: Readonly<SecurityStatusBannerContentProps>) {
  const vulnOrSafeIconClass = status.hasVulnerabilities ? 'text-yellow-600' : 'text-green-600';
  const iconClass = status.hasCritical ? 'text-red-500' : vulnOrSafeIconClass;
  const vulnOrSafeHeadingClass = status.hasVulnerabilities ? 'text-yellow-700' : 'text-green-700';
  const headingClass = status.hasCritical ? 'text-red-700' : vulnOrSafeHeadingClass;
  const vulnOrSafeBodyText = status.hasVulnerabilities
    ? 'Review and address vulnerabilities as appropriate'
    : 'Your dependencies are secure';
  const bodyText = status.hasCritical
    ? 'Immediate action required - critical security issues detected'
    : vulnOrSafeBodyText;
  return (
    <>
      <Icon name={status.iconName} className={iconClass} size="2xl" />
      <div>
        <div className={`text-lg font-semibold ${headingClass}`}>{status.statusText}</div>
        <div className="text-sm text-gray-600">{bodyText}</div>
      </div>
    </>
  );
}

function buildInitialScanState(scanId: string): Partial<ScanState> {
  return {
    completedAt: null,
    progress: {
      dependency_check: 'pending',
      outdated_check: 'pending',
      secret_scan: 'pending',
      sast_scan: 'pending',
    },
    errors: [],
    status: 'running' as const,
    startedAt: new Date().toISOString(),
    currentStep: 'Initializing...',
    scanId,
  };
}

async function fetchSecurityMetrics(): Promise<{
  metrics: SecurityMetrics;
  scanState: ScanState | null;
}> {
  const response = await fetch('/api/tracking/security');
  if (!response.ok) throw new Error('Failed to fetch security metrics');
  return response.json();
}

async function startSecurityScan(): Promise<{ scanId?: string }> {
  const response = await fetch('/api/tracking/security', { method: 'POST' });
  if (!response.ok) throw new Error('Scan failed');
  return response.json();
}

async function pollScanStatus(): Promise<{ scan: ScanState } | null> {
  const response = await fetch('/api/tracking/security?status=true');
  if (!response.ok) return null;
  return response.json();
}

async function pollAndUpdateScanState(
  setScanState: React.Dispatch<React.SetStateAction<ScanState | null>>,
  onComplete: () => void,
  interval: NodeJS.Timeout
): Promise<void> {
  try {
    const result = await pollScanStatus();
    if (!result) return;
    const newState = result.scan;
    setScanState(newState);
    if (newState.status === 'completed' || newState.status === 'failed') {
      clearInterval(interval);
      onComplete();
    }
  } catch {
    // Silently handle polling errors
  }
}

// --- Sub-components for complex render sections ---

interface OutdatedDepsSectionProps {
  outdatedDeps: SecurityMetrics['outdatedDeps'] | undefined;
}

function OutdatedDepsSection({ outdatedDeps }: Readonly<OutdatedDepsSectionProps>) {
  const hasData = outdatedDeps && (outdatedDeps.total > 0 || outdatedDeps.lastScan);
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <Icon name="history" size="base" />
        Outdated Dependencies
      </h4>
      {hasData ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <MetricCard
              title="Major"
              value={outdatedDeps.major}
              icon="error"
              variant={outdatedDeps.major > 0 ? 'error' : 'default'}
            />
            <MetricCard
              title="Minor"
              value={outdatedDeps.minor}
              icon="warning"
              variant={outdatedDeps.minor > 0 ? 'warning' : 'default'}
            />
            <MetricCard title="Patch" value={outdatedDeps.patch} icon="info" variant="info" />
            <MetricCard title="Total" value={outdatedDeps.total} icon="list" variant="default" />
          </div>
          {outdatedDeps.packages.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                View {outdatedDeps.packages.length} outdated packages
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="text-left py-1 pr-4">Package</th>
                      <th className="text-left py-1 pr-4">Current</th>
                      <th className="text-left py-1 pr-4">Latest</th>
                      <th className="text-left py-1">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outdatedDeps.packages.map((pkg) => (
                      <tr key={pkg.name} className="border-b border-gray-100">
                        <td className="py-1 pr-4 font-mono">{pkg.name}</td>
                        <td className="py-1 pr-4 text-gray-500">{pkg.current}</td>
                        <td className="py-1 pr-4">{pkg.latest}</td>
                        <td className="py-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs ${getPackageTypeBadgeClass(pkg.type)}`}
                          >
                            {pkg.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      ) : (
        <div className="text-sm text-gray-400 italic">No dependency data available</div>
      )}
    </div>
  );
}

interface RemediationSectionProps {
  remediationDisplay: ReturnType<typeof getRemediationSummary> | {
    isEmpty: true;
    emptyMessage: string;
    fixedCount: 0;
    openCount: 0;
    waiverCount: 0;
    mttrDisplay: string;
  };
  items: RemediationItem[] | undefined;
}

function RemediationSection({ remediationDisplay, items }: Readonly<RemediationSectionProps>) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <Icon name="healing" size="base" />
        Remediation Tracking
      </h4>
      {remediationDisplay.isEmpty ? (
        <div className="text-sm text-gray-400 italic">{remediationDisplay.emptyMessage}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <MetricCard
              title="Fixed"
              value={remediationDisplay.fixedCount}
              icon="check_circle"
              variant="success"
            />
            <MetricCard
              title="Open"
              value={remediationDisplay.openCount}
              icon="error"
              variant={remediationDisplay.openCount > 0 ? 'error' : 'default'}
            />
            <MetricCard
              title="Waived"
              value={remediationDisplay.waiverCount}
              icon="do_not_disturb"
              variant="default"
            />
            <MetricCard
              title="MTTR"
              value={remediationDisplay.mttrDisplay}
              icon="schedule"
              variant="default"
            />
          </div>
          {items && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left py-1 pr-3">ID</th>
                    <th className="text-left py-1 pr-3">Module</th>
                    <th className="text-left py-1 pr-3">Severity</th>
                    <th className="text-left py-1 pr-3">Status</th>
                    <th className="text-left py-1">Fix Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr
                      key={`${item.id}-${item.module}-${idx}`}
                      className="border-b border-gray-100"
                    >
                      <td className="py-1 pr-3 font-mono">{item.id}</td>
                      <td className="py-1 pr-3">{item.module}</td>
                      <td className="py-1 pr-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs ${getSeverityBadgeClass(item.severity)}`}
                        >
                          {item.severity}
                        </span>
                      </td>
                      <td className="py-1 pr-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs ${getStatusBadgeClass(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-1 text-gray-500">{item.fixApplied || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface BaselineAndHistorySectionProps {
  data: SecurityMetrics | null;
  vulns: VulnerabilityCounts;
}

function BaselineAndHistorySection({ data, vulns }: Readonly<BaselineAndHistorySectionProps>) {
  return (
    <>
      {/* TrendSparkline (AC-002) */}
      {data?.scanHistory && data.scanHistory.length >= 2 && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-gray-500">Vulnerability trend:</span>
          <TrendSparkline
            data={data.scanHistory.map((s) => ({ date: s.date, value: s.total }))}
            label="Vulnerability trend over time"
          />
        </div>
      )}

      {/* Baseline Comparison */}
      {data?.baseline && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Icon name="difference" size="base" />
            Baseline Comparison (from {formatBaselineDate(data.baseline.date)})
          </h4>
          <div className="grid grid-cols-2 gap-4">
            {(['critical', 'high'] as const).map((severity) => {
              const delta = getBaselineDelta(vulns[severity], data.baseline![severity]);
              return (
                <div key={severity} className="flex items-center gap-3">
                  <span className="text-gray-500 capitalize">{severity}:</span>
                  <span className="font-mono text-gray-900">{data.baseline![severity]}</span>
                  {delta.show && (
                    <span className={`text-sm ${delta.colorClass}`}>{delta.value}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scan History */}
      {data?.scanHistory && data.scanHistory.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Icon name="history" size="base" />
            Scan History
          </h4>
          <div className="space-y-2">
            {getScanHistorySlice(data.scanHistory, 5).map((scan, idx) => (
              <div key={scan.date || idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{new Date(scan.date).toLocaleString()}</span>
                <div className="flex items-center gap-4">
                  <span className={getHistoryItemColor(scan.critical)}>
                    {scan.critical} critical
                  </span>
                  <span className="text-gray-700">{scan.total} total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

interface SecretScanSectionProps {
  secretScan: SecurityMetrics['secretScan'] | undefined;
}

function SecretScanSection({ secretScan }: Readonly<SecretScanSectionProps>) {
  const hasData =
    secretScan &&
    (secretScan.lastScan || secretScan.leaksFound > 0 || secretScan.filesScanned > 0);
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <Icon name="shield" size="base" />
        Secret Scan
      </h4>
      {hasData ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              title="Leaks Found"
              value={secretScan.leaksFound}
              icon="lock_open"
              variant={secretScan.leaksFound > 0 ? 'error' : 'success'}
            />
            <MetricCard
              title="Files Scanned"
              value={secretScan.filesScanned}
              icon="description"
              variant="default"
            />
          </div>
          {secretScan.lastScan && (
            <StaleIndicator
              lastUpdated={secretScan.lastScan}
              thresholdMinutes={STALE_THRESHOLD_MINUTES}
              showTime
            />
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-400 italic">No gitleaks data — scan not run</div>
      )}
    </div>
  );
}

// --- Component ---

export default function SecurityDashboard() {
  const [data, setData] = useState<SecurityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [scanState, setScanState] = useState<ScanState | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await fetchSecurityMetrics();
      setData(result.metrics);
      setScanState(result.scanState);
      setErrors({});
    } catch (err) {
      setErrors({ general: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await startSecurityScan();
      if (result.scanId) {
        setScanState(() => ({
          status: 'idle' as const,
          startedAt: null,
          completedAt: null,
          currentStep: null,
          progress: {
            dependency_check: 'pending',
            outdated_check: 'pending',
            secret_scan: 'pending',
            sast_scan: 'pending',
          },
          errors: [],
          scanId: null,
          ...buildInitialScanState(result.scanId!),
        }));
      }
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        scan: err instanceof Error ? err.message : 'Scan failed',
      }));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Scan state polling (NF-001)
  useEffect(() => {
    if (scanState?.status !== 'running') return;

    const interval = setInterval(() => {
      pollAndUpdateScanState(setScanState, fetchData, interval);
    }, 3000);

    return () => clearInterval(interval);
  }, [scanState?.status, fetchData]);

  // Loading/error/empty states
  const loadState = getLoadingState(loading, data, errors);

  if (loadState.showLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" className="animate-spin text-blue-500" size="2xl" />
      </div>
    );
  }

  if (loadState.showError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
        <div className="flex items-center gap-2">
          <Icon name="error" size="lg" />
          <span>Error: {loadState.errorMessage}</span>
        </div>
        <button onClick={fetchData} className="mt-2 text-sm underline hover:no-underline">
          Try again
        </button>
      </div>
    );
  }

  const vulns = getVulnerabilityDefaults(data?.vulnerabilities ?? null);
  const status = getSecurityStatus(vulns);
  const scanProgress = getScanProgressDisplay(scanState);
  const btnState = getScanButtonState(scanning);
  const remediationDisplay = data?.remediation
    ? getRemediationSummary(data.remediation)
    : {
        isEmpty: true,
        emptyMessage: 'No vulnerabilities to track',
        fixedCount: 0,
        openCount: 0,
        waiverCount: 0,
        mttrDisplay: 'N/A',
      };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon
            name="shield"
            className={status.hasCritical ? 'text-red-500' : 'text-green-600'}
            size="xl"
          />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Security Dashboard</h3>
            {data?.lastScan && (
              <StaleIndicator
                lastUpdated={data.lastScan}
                thresholdMinutes={STALE_THRESHOLD_MINUTES}
                showTime
              />
            )}
          </div>
        </div>
        <div className="relative group">
          <RefreshButton
            onRefresh={handleScan}
            label={btnState.label}
            disabled={btnState.disabled}
          />
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block text-xs bg-gray-800 text-white rounded px-2 py-1 whitespace-nowrap">
            Triggers scan state update — actual scan executed externally
          </span>
        </div>
      </div>

      {/* Scan Progress Banner */}
      {scanProgress.showBanner && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
          <Icon name="progress_activity" className="animate-spin text-blue-500" size="lg" />
          <div>
            <div className="text-sm font-medium text-blue-700">Scan in progress</div>
            {scanProgress.currentStep && (
              <div className="text-xs text-blue-600">{scanProgress.currentStep}</div>
            )}
          </div>
        </div>
      )}

      {/* Per-section scan error */}
      {errors.scan && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
          <Icon name="error" size="base" />
          <span>Scan error: {errors.scan}</span>
        </div>
      )}

      {/* Security Status Banner */}
      <div className={`rounded-lg p-4 border ${status.bannerClass}`}>
        <div className="flex items-center gap-3">
          <SecurityStatusBannerContent status={status} />
        </div>
      </div>

      {/* Vulnerability Breakdown + TrendSparkline */}
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
        <MetricCard title="Low" value={vulns.low} icon="remove_circle" variant="default" />
      </div>

      {/* TrendSparkline, Baseline Comparison, Scan History (AC-002) */}
      <BaselineAndHistorySection data={data} vulns={vulns} />

      {/* Outdated Dependencies (AC-005) */}
      <OutdatedDepsSection outdatedDeps={data?.outdatedDeps} />

      {/* Secret Scan (AC-006) */}
      <SecretScanSection secretScan={data?.secretScan} />

      {/* SAST Summary (AC-007) */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <Icon name="bug_report" size="base" />
          SAST Analysis
        </h4>
        {data?.sastScan?.available ? (
          <div className="grid grid-cols-3 gap-4">
            <MetricCard
              title="Vulnerabilities"
              value={data.sastScan.vulnerabilities}
              icon="security"
              variant={data.sastScan.vulnerabilities > 0 ? 'error' : 'success'}
            />
            <MetricCard
              title="Hotspots"
              value={data.sastScan.securityHotspots}
              icon="local_fire_department"
              variant={data.sastScan.securityHotspots > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              title="Rating"
              value={data.sastScan.securityRating}
              icon="grade"
              variant="default"
            />
          </div>
        ) : (
          <div className="text-sm text-gray-400 italic">SonarQube not available</div>
        )}
      </div>

      {/* Remediation Tracking (AC-004) */}
      <RemediationSection
        remediationDisplay={remediationDisplay}
        items={data?.remediation?.items}
      />

      {/* Compliance Checks (AC-008 — 4 cards) */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <Icon name="assignment_turned_in" size="base" />
          Compliance Status
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { key: 'owasp_top10' as const, label: 'OWASP Top 10' },
            { key: 'dependency_check' as const, label: 'Dependency Check' },
            { key: 'secret_scan' as const, label: 'Secret Scan' },
            { key: 'deps_current' as const, label: 'Deps Current' },
          ].map(({ key, label }) => {
            const value = data?.compliance?.[key] ?? false;
            const ci = getComplianceIcon(value);
            return (
              <div
                key={key}
                className={`flex items-center gap-2 p-3 rounded-lg ${
                  value ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}
              >
                <Icon name={ci.icon} className={ci.colorClass} size="lg" />
                <span className="text-gray-900 text-sm">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
