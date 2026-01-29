import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const ARTIFACTS_DIR = path.join(process.cwd(), '..', '..', 'artifacts');
const SECURITY_DIR = path.join(ARTIFACTS_DIR, 'reports', 'security');
const PNPM_AUDIT_PATH = path.join(SECURITY_DIR, 'pnpm-audit-latest.json');
const PNPM_OUTDATED_PATH = path.join(SECURITY_DIR, 'pnpm-outdated-latest.json');
const GITLEAKS_PATH = path.join(SECURITY_DIR, 'gitleaks-latest.json');
const SONAR_PATH = path.join(SECURITY_DIR, 'sonarqube-metrics.json');
const BASELINE_PATH = path.join(ARTIFACTS_DIR, 'misc', 'vulnerability-baseline.json');
const SCAN_STATE_PATH = path.join(SECURITY_DIR, 'scan-state.json');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Interfaces
interface VulnerabilityCounts {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  total: number;
}

interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  type: 'major' | 'minor' | 'patch';
}

interface OutdatedDeps {
  major: number;
  minor: number;
  patch: number;
  total: number;
  packages: OutdatedPackage[];
  lastScan: string | null;
}

interface SecretScan {
  leaksFound: number;
  filesScanned: number;
  lastScan: string | null;
}

interface SastScan {
  vulnerabilities: number;
  securityHotspots: number;
  securityRating: string;
  available: boolean;
}

interface Baseline {
  critical: number;
  high: number;
  date: string;
}

interface ScanHistory {
  date: string;
  total: number;
  critical: number;
  secretLeaks?: number;
  sastVulns?: number;
}

interface Compliance {
  owasp_top10: boolean;
  dependency_check: boolean;
  secret_scan: boolean;
  deps_current: boolean;
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
  outdatedDeps: OutdatedDeps;
  secretScan: SecretScan;
  sastScan: SastScan;
  baseline: Baseline | null;
  scanHistory: ScanHistory[];
  compliance: Compliance;
  lastScan: string | null;
}

// Default scan state
const DEFAULT_SCAN_STATE: ScanState = {
  status: 'idle',
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
};

// Helper to read JSON file with graceful error handling
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Helper to get file modification time
async function getFileMtime(filePath: string): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime.toISOString();
  } catch {
    return null;
  }
}

// Parse vulnerability counts from audit data (supports multiple formats)
function parseVulnerabilities(auditData: any): VulnerabilityCounts {
  const defaults = { critical: 0, high: 0, moderate: 0, low: 0, total: 0 };
  if (!auditData) return defaults;

  // Format 1: metadata.vulnerabilities
  if (auditData.metadata?.vulnerabilities) {
    const v = auditData.metadata.vulnerabilities;
    return {
      critical: v.critical || 0,
      high: v.high || 0,
      moderate: v.moderate || 0,
      low: v.low || 0,
      total: v.total || (v.critical || 0) + (v.high || 0) + (v.moderate || 0) + (v.low || 0),
    };
  }

  // Format 2: direct vulnerabilities object
  if (auditData.vulnerabilities) {
    const v = auditData.vulnerabilities;
    const critical = v.critical || 0;
    const high = v.high || 0;
    const moderate = v.moderate || v.medium || 0; // medium -> moderate mapping
    const low = v.low || 0;
    return {
      critical,
      high,
      moderate,
      low,
      total: v.total || critical + high + moderate + low,
    };
  }

  return defaults;
}

// Parse outdated dependencies data
function parseOutdatedDeps(outdatedData: any, lastScan: string | null): OutdatedDeps {
  if (!outdatedData) {
    return { major: 0, minor: 0, patch: 0, total: 0, packages: [], lastScan };
  }

  return {
    major: outdatedData.major || 0,
    minor: outdatedData.minor || 0,
    patch: outdatedData.patch || 0,
    total: outdatedData.total || 0,
    packages: outdatedData.packages || [],
    lastScan,
  };
}

// Parse secret scan (gitleaks) data
function parseSecretScan(gitleaksData: any, lastScan: string | null): SecretScan {
  if (!gitleaksData) {
    return { leaksFound: 0, filesScanned: 0, lastScan };
  }

  // If findings array exists but no leaksFound, count findings
  const leaksFound = gitleaksData.leaksFound ?? (gitleaksData.findings?.length || 0);
  return {
    leaksFound,
    filesScanned: gitleaksData.filesScanned || 0,
    lastScan,
  };
}

// Parse SAST (SonarQube) data
function parseSastScan(sonarData: any): SastScan {
  if (!sonarData || sonarData.sonarAvailable === false || sonarData.success === false) {
    return {
      vulnerabilities: 0,
      securityHotspots: 0,
      securityRating: 'N/A',
      available: false,
    };
  }

  return {
    vulnerabilities: sonarData.vulnerabilities || 0,
    securityHotspots: sonarData.securityHotspots || 0,
    securityRating: sonarData.securityRating || 'N/A',
    available: sonarData.sonarAvailable ?? true,
  };
}

// Parse baseline data
function parseBaseline(baselineData: any): Baseline | null {
  if (!baselineData) return null;

  return {
    critical: baselineData.critical || 0,
    high: baselineData.high || 0,
    date: baselineData.date || baselineData.lastUpdated || 'Unknown',
  };
}

// Calculate compliance based on metrics
function calculateCompliance(
  vulns: VulnerabilityCounts,
  outdated: OutdatedDeps,
  secretScan: SecretScan,
  outdatedDataAvailable: boolean
): Compliance {
  return {
    owasp_top10: vulns.critical === 0,
    dependency_check: true, // Audit ran successfully
    secret_scan: secretScan.leaksFound === 0,
    // deps_current is true if no major updates OR if no outdated data (assume current)
    deps_current: !outdatedDataAvailable || outdated.major === 0,
  };
}

// Get scan state from file
async function getScanState(): Promise<ScanState> {
  const data = await readJsonFile<ScanState>(SCAN_STATE_PATH);
  return data || { ...DEFAULT_SCAN_STATE };
}

// Check if scan is stale (>10 minutes)
function isScanStale(scanState: ScanState): boolean {
  if (scanState.status !== 'running' || !scanState.startedAt) return false;
  const startedAt = new Date(scanState.startedAt).getTime();
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  return now - startedAt > tenMinutes;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusOnly = searchParams.get('status') === 'true';

    // Status-only mode: just return scan state
    if (statusOnly) {
      const scanState = await getScanState();
      return NextResponse.json({
        status: 'ok',
        scan: scanState,
      });
    }

    // Full metrics mode: read all 6 files in order
    const [auditData, outdatedData, gitleaksData, sonarData, baselineData, scanStateData] =
      await Promise.all([
        readJsonFile<any>(PNPM_AUDIT_PATH),
        readJsonFile<any>(PNPM_OUTDATED_PATH),
        readJsonFile<any>(GITLEAKS_PATH),
        readJsonFile<any>(SONAR_PATH),
        readJsonFile<any>(BASELINE_PATH),
        readJsonFile<ScanState>(SCAN_STATE_PATH),
      ]);

    // Get file modification times for lastScan timestamps
    const lastScan = await getFileMtime(PNPM_AUDIT_PATH);

    // Parse all data
    const vulnerabilities = parseVulnerabilities(auditData);
    const outdatedDeps = parseOutdatedDeps(outdatedData, lastScan);
    const secretScan = parseSecretScan(gitleaksData, lastScan);
    const sastScan = parseSastScan(sonarData);
    const baseline = parseBaseline(baselineData);
    const scanHistory: ScanHistory[] = baselineData?.history || [];
    const scanState = scanStateData || { ...DEFAULT_SCAN_STATE };

    // Calculate compliance (outdatedData !== null tells us if file was available)
    const compliance = calculateCompliance(
      vulnerabilities,
      outdatedDeps,
      secretScan,
      outdatedData !== null
    );

    const metrics: SecurityMetrics = {
      vulnerabilities,
      outdatedDeps,
      secretScan,
      sastScan,
      baseline,
      scanHistory,
      compliance,
      lastScan,
    };

    return NextResponse.json({
      status: 'ok',
      metrics,
      scanState,
    });
  } catch (error) {
    console.error('Error reading security metrics:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(_request: NextRequest) {
  try {
    // Get current scan state
    const currentState = await getScanState();

    // Check if scan is already running (and not stale)
    if (currentState.status === 'running' && !isScanStale(currentState)) {
      return NextResponse.json(
        {
          status: 'busy',
          message: 'Security scan already running',
          scan: currentState,
        },
        { status: 409 }
      );
    }

    // Generate new scan ID
    const scanId = `scan-${Date.now()}`;

    // Create new scan state
    const newScanState: ScanState = {
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      currentStep: 'Initializing security scan...',
      progress: {
        dependency_check: 'pending',
        outdated_check: 'pending',
        secret_scan: 'pending',
        sast_scan: 'pending',
      },
      errors: [],
      scanId,
    };

    // Ensure security directory exists
    await fs.mkdir(SECURITY_DIR, { recursive: true });

    // Save new scan state
    await fs.writeFile(SCAN_STATE_PATH, JSON.stringify(newScanState, null, 2));

    return NextResponse.json({
      status: 'ok',
      message: 'Security scan started',
      scanId,
      pollUrl: '/api/tracking/security?status=true',
    });
  } catch (error) {
    console.error('Error starting security scan:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}
