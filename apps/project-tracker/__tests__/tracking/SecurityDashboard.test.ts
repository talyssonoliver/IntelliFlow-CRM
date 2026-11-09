import { describe, it, expect } from 'vitest';

import {
  STALE_THRESHOLD_MINUTES,
  getBaselineDelta,
  getComplianceIcon,
  getHistoryItemColor,
  getLoadingState,
  getRemediationSummary,
  getScanButtonState,
  getScanHistorySlice,
  getScanProgressDisplay,
  getSecurityStatus,
  getVulnerabilityDefaults,
} from '../../components/tracking/SecurityDashboard';

/**
 * SecurityDashboard's exported helpers, imported from the component. This file used to define
 * copies of them inline, because the root test project had no `@/` alias for project-tracker
 * code and the component could not be imported (#1216); vitest.config.ts now resolves it.
 */

describe('getSecurityStatus', () => {
  it('returns red banner when critical vulnerabilities present', () => {
    const result = getSecurityStatus({ critical: 3, high: 1, moderate: 0, low: 0, total: 4 });
    expect(result.hasCritical).toBe(true);
    expect(result.bannerClass).toContain('red');
    expect(result.iconName).toBe('gpp_maybe');
    expect(result.statusText).toContain('Critical');
  });

  it('returns yellow banner when non-critical vulnerabilities present', () => {
    const result = getSecurityStatus({ critical: 0, high: 2, moderate: 1, low: 0, total: 3 });
    expect(result.hasCritical).toBe(false);
    expect(result.hasVulnerabilities).toBe(true);
    expect(result.bannerClass).toContain('yellow');
    expect(result.iconName).toBe('shield');
    expect(result.statusText).toContain('Vulnerabilities Found');
  });

  it('returns green banner when no vulnerabilities', () => {
    const result = getSecurityStatus({ critical: 0, high: 0, moderate: 0, low: 0, total: 0 });
    expect(result.hasCritical).toBe(false);
    expect(result.hasVulnerabilities).toBe(false);
    expect(result.bannerClass).toContain('green');
    expect(result.iconName).toBe('verified_user');
    expect(result.statusText).toBe('No Vulnerabilities Detected');
  });
});

// --- Group 2: getComplianceIcon — compliance icon mapping (8 tests) ---

describe('getComplianceIcon', () => {
  it('returns check_circle + green for owasp_top10=true', () => {
    const result = getComplianceIcon(true);
    expect(result.icon).toBe('check_circle');
    expect(result.colorClass).toContain('green');
  });

  it('returns cancel + red for owasp_top10=false', () => {
    const result = getComplianceIcon(false);
    expect(result.icon).toBe('cancel');
    expect(result.colorClass).toContain('red');
  });

  it('returns check_circle + green for dependency_check=true', () => {
    const result = getComplianceIcon(true);
    expect(result.icon).toBe('check_circle');
    expect(result.colorClass).toContain('green');
  });

  it('returns cancel + red for dependency_check=false', () => {
    const result = getComplianceIcon(false);
    expect(result.icon).toBe('cancel');
    expect(result.colorClass).toContain('red');
  });

  it('returns check_circle + green for secret_scan=true', () => {
    const result = getComplianceIcon(true);
    expect(result.icon).toBe('check_circle');
    expect(result.colorClass).toContain('green');
  });

  it('returns cancel + red for secret_scan=false', () => {
    const result = getComplianceIcon(false);
    expect(result.icon).toBe('cancel');
    expect(result.colorClass).toContain('red');
  });

  it('returns check_circle + green for deps_current=true', () => {
    const result = getComplianceIcon(true);
    expect(result.icon).toBe('check_circle');
    expect(result.colorClass).toContain('green');
  });

  it('returns cancel + red for deps_current=false', () => {
    const result = getComplianceIcon(false);
    expect(result.icon).toBe('cancel');
    expect(result.colorClass).toContain('red');
  });
});

// --- Group 3: getBaselineDelta — delta computation (4 tests) ---

describe('getBaselineDelta', () => {
  it('returns positive delta with red class when current > baseline', () => {
    const result = getBaselineDelta(5, 3);
    expect(result.value).toBe('+2');
    expect(result.colorClass).toContain('red');
    expect(result.show).toBe(true);
  });

  it('returns negative delta with green class when current < baseline', () => {
    const result = getBaselineDelta(2, 5);
    expect(result.value).toBe('-3');
    expect(result.colorClass).toContain('green');
    expect(result.show).toBe(true);
  });

  it('returns hidden delta when current equals baseline', () => {
    const result = getBaselineDelta(3, 3);
    expect(result.show).toBe(false);
  });

  it('returns hidden delta when baseline is null', () => {
    const result = getBaselineDelta(3, null);
    expect(result.show).toBe(false);
  });
});

// --- Group 4: getScanHistorySlice — history truncation (3 tests) ---

describe('getScanHistorySlice', () => {
  it('returns all entries when fewer than max', () => {
    const history = [
      { date: '2026-01-01', total: 5, critical: 0 },
      { date: '2026-01-02', total: 3, critical: 0 },
      { date: '2026-01-03', total: 2, critical: 0 },
    ];
    const result = getScanHistorySlice(history, 5);
    expect(result).toHaveLength(3);
  });

  it('returns first 5 entries when more than max', () => {
    const history = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-01-0${i + 1}`,
      total: 10 - i,
      critical: 0,
    }));
    const result = getScanHistorySlice(history, 5);
    expect(result).toHaveLength(5);
  });

  it('returns empty array for empty input', () => {
    const result = getScanHistorySlice([], 5);
    expect(result).toHaveLength(0);
  });
});

// --- Group 5: getHistoryItemColor — scan history severity (2 tests) ---

describe('getHistoryItemColor', () => {
  it('returns red class when critical > 0', () => {
    const result = getHistoryItemColor(3);
    expect(result).toContain('red');
  });

  it('returns green class when critical === 0', () => {
    const result = getHistoryItemColor(0);
    expect(result).toContain('green');
  });
});

// --- Group 6: getVulnerabilityDefaults — null guard (2 tests) ---

describe('getVulnerabilityDefaults', () => {
  it('returns all zeros when data is null', () => {
    const result = getVulnerabilityDefaults(null);
    expect(result.critical).toBe(0);
    expect(result.high).toBe(0);
    expect(result.moderate).toBe(0);
    expect(result.low).toBe(0);
    expect(result.total).toBe(0);
  });

  it('returns correct counts when data present', () => {
    const data = { critical: 1, high: 2, moderate: 3, low: 4, total: 10 };
    const result = getVulnerabilityDefaults(data);
    expect(result.critical).toBe(1);
    expect(result.high).toBe(2);
    expect(result.moderate).toBe(3);
    expect(result.low).toBe(4);
    expect(result.total).toBe(10);
  });
});

// --- Group 7: getScanButtonState — button label/disabled (2 tests) ---

describe('getScanButtonState', () => {
  it('returns "Run Scan" label when not scanning', () => {
    const result = getScanButtonState(false);
    expect(result.label).toBe('Run Scan');
    expect(result.disabled).toBe(false);
  });

  it('returns "Scanning..." label when scanning', () => {
    const result = getScanButtonState(true);
    expect(result.label).toBe('Scanning...');
    expect(result.disabled).toBe(true);
  });
});

// --- Group 8: getRemediationSummary — remediation display logic (4 tests) ---

describe('getRemediationSummary', () => {
  it('returns "No vulnerabilities to track" for empty items', () => {
    const result = getRemediationSummary({
      fixedCount: 0,
      openCount: 0,
      waiverCount: 0,
      mttrHours: null,
      items: [],
    });
    expect(result.emptyMessage).toBe('No vulnerabilities to track');
    expect(result.isEmpty).toBe(true);
  });

  it('returns correct counts when all items are fixed', () => {
    const result = getRemediationSummary({
      fixedCount: 3,
      openCount: 0,
      waiverCount: 0,
      mttrHours: 0.5,
      items: [
        {
          id: 'CVE-1',
          module: 'lodash',
          severity: 'high',
          status: 'fixed',
          fixApplied: 'Override',
        },
        {
          id: 'CVE-2',
          module: 'esbuild',
          severity: 'moderate',
          status: 'fixed',
          fixApplied: 'Update',
        },
        { id: 'CVE-3', module: 'diff', severity: 'low', status: 'fixed', fixApplied: 'Override' },
      ],
    });
    expect(result.isEmpty).toBe(false);
    expect(result.fixedCount).toBe(3);
    expect(result.openCount).toBe(0);
    expect(result.mttrDisplay).toBe('0.5h');
  });

  it('returns correct counts for mixed statuses', () => {
    const result = getRemediationSummary({
      fixedCount: 1,
      openCount: 2,
      waiverCount: 1,
      mttrHours: 2.0,
      items: [
        {
          id: 'CVE-1',
          module: 'lodash',
          severity: 'high',
          status: 'fixed',
          fixApplied: 'Override',
        },
        { id: 'CVE-2', module: 'esbuild', severity: 'critical', status: 'open' },
        { id: 'CVE-3', module: 'diff', severity: 'moderate', status: 'open' },
        { id: 'CVE-4', module: 'axios', severity: 'low', status: 'waived' },
      ],
    });
    expect(result.fixedCount).toBe(1);
    expect(result.openCount).toBe(2);
    expect(result.waiverCount).toBe(1);
    expect(result.mttrDisplay).toBe('2h');
  });

  it('displays "N/A" when mttrHours is null', () => {
    const result = getRemediationSummary({
      fixedCount: 1,
      openCount: 0,
      waiverCount: 0,
      mttrHours: null,
      items: [
        {
          id: 'CVE-1',
          module: 'lodash',
          severity: 'high',
          status: 'fixed',
          fixApplied: 'Override',
        },
      ],
    });
    expect(result.mttrDisplay).toBe('N/A');
  });
});

// --- Group 9: StaleIndicator threshold constant (1 test) ---

describe('STALE_THRESHOLD_MINUTES', () => {
  it('equals 10080 (7 days)', () => {
    expect(STALE_THRESHOLD_MINUTES).toBe(10080);
    expect(STALE_THRESHOLD_MINUTES).toBe(7 * 24 * 60);
  });
});

// --- Group 10: getScanProgressDisplay — scan state rendering (1 test) ---

describe('getScanProgressDisplay', () => {
  it('shows progress banner when scan is running', () => {
    const result = getScanProgressDisplay({
      status: 'running',
      startedAt: '2026-02-22T12:00:00Z',
      completedAt: null,
      currentStep: 'Running dependency audit...',
      progress: {
        dependency_check: 'running',
        outdated_check: 'pending',
        secret_scan: 'pending',
        sast_scan: 'pending',
      },
      errors: [],
      scanId: 'scan-123',
    });
    expect(result.showBanner).toBe(true);
    expect(result.currentStep).toBe('Running dependency audit...');
    expect(result.isRunning).toBe(true);
  });
});

// --- Group 11: getLoadingState — error and loading states (3 tests) ---

describe('getLoadingState', () => {
  it('returns error display when error present', () => {
    const result = getLoadingState(false, null, { general: 'Something went wrong' });
    expect(result.showError).toBe(true);
    expect(result.errorMessage).toBe('Something went wrong');
    expect(result.showLoading).toBe(false);
  });

  it('returns loading spinner state when loading=true', () => {
    const result = getLoadingState(true, null, {});
    expect(result.showLoading).toBe(true);
    expect(result.showError).toBe(false);
    expect(result.showEmpty).toBe(false);
  });

  it('returns empty/no-data state when loading=false and data=null', () => {
    const result = getLoadingState(false, null, {});
    expect(result.showEmpty).toBe(true);
    expect(result.showLoading).toBe(false);
    expect(result.showError).toBe(false);
  });
});
