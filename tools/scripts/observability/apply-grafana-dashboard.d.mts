// Types for apply-grafana-dashboard.mjs (used by its tests).
export interface DashboardTarget {
  refId: string;
  expr: string;
  datasource: { type?: string; uid: string };
  legendFormat?: string;
  instant?: boolean;
}
export interface DashboardPanel {
  type: string;
  title: string;
  targets: DashboardTarget[];
  [key: string]: unknown;
}
export interface DashboardConfig {
  folderUid: string;
  dashboard: { uid: string; title: string; panels: DashboardPanel[]; [key: string]: unknown };
}
export function validateConfig(config: {
  folderUid?: string;
  dashboard?: { uid?: string; panels?: Array<{ targets?: Array<{ expr?: string }> }> };
}): string[];
export function run(options?: {
  env?: Record<string, string | undefined>;
  argv?: string[];
  fetchImpl?: (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => Promise<{ status: number; text(): Promise<string> }>;
  log?: (line: string) => void;
  /** Wait between 503 retries; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ applied: boolean; existed: boolean }>;
