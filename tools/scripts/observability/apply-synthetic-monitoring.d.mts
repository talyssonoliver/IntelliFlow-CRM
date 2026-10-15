// Types for apply-synthetic-monitoring.mjs (used by its tests).
export interface SyntheticCheckConfig {
  job: string;
  target: string;
  frequencySeconds: number;
  timeoutSeconds: number;
  probeNames: string[];
  labels?: Array<{ name: string; value: string }>;
  http: {
    method: string;
    ipVersion: 'V4' | 'V6' | 'Any';
    noFollowRedirects: boolean;
    validStatusCodes: number[];
  };
}
export interface AlertRuleEntry {
  uid: string;
  title: string;
  expr: string;
  selector: string;
  operator: 'gt' | 'lt';
  threshold: number;
  for: string;
  noData: 'OK' | 'Alerting' | 'NoData';
  severity: string;
  summary: string;
}
export interface SyntheticMonitoringConfig {
  check: SyntheticCheckConfig;
  alertRule: AlertRuleEntry;
  folder: { uid: string; title: string };
  datasourceUid: string;
  group: { name: string };
}
export interface Probe {
  id: number;
  name: string;
  public: boolean;
}
export interface SyntheticCheck {
  id?: number;
  job: string;
  target: string;
  frequency: number;
  timeout: number;
  enabled: boolean;
  probes: number[];
  labels: Array<{ name: string; value: string }>;
  settings: { http: Record<string, unknown> };
}
export interface GrafanaAlertRule {
  uid: string;
  title: string;
  folderUID: string;
  ruleGroup: string;
  condition: string;
  noDataState: string;
  for: string;
  data: Array<{
    refId: string;
    datasourceUid: string;
    model: Record<string, unknown> & {
      expr?: string;
      conditions?: Array<{ evaluator: { type: string; params: number[] } }>;
    };
  }>;
}
export function validateConfig(config: {
  check: Partial<SyntheticCheckConfig> & { http?: Partial<SyntheticCheckConfig['http']> };
  alertRule: Partial<AlertRuleEntry>;
}): string[];
export function buildCheckPayload(check: SyntheticCheckConfig, probeIds: number[]): SyntheticCheck;
export function buildAlertRule(
  entry: AlertRuleEntry,
  config: Pick<SyntheticMonitoringConfig, 'folder' | 'group' | 'datasourceUid'>
): GrafanaAlertRule;
export function run(options?: {
  env?: Record<string, string | undefined>;
  argv?: string[];
  fetchImpl?: (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => Promise<{ status: number; text(): Promise<string> }>;
  log?: (line: string) => void;
}): Promise<{
  check: 'created' | 'updated';
  alertRule: 'created' | 'updated';
  probeIds: number[];
  seriesChecked: boolean;
  empty: string[];
}>;
