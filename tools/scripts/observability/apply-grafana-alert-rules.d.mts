// Types for apply-grafana-alert-rules.mjs (used by its tests).
export interface AlertRuleEntry {
  uid: string;
  title: string;
  expr: string;
  selector?: string;
  operator: 'gt' | 'lt';
  threshold: number;
  for: string;
  noData: 'OK' | 'Alerting' | 'NoData';
  severity: string;
  summary: string;
  requireSeries?: boolean;
}
export interface AlertRulesConfig {
  folder: { uid: string; title: string };
  datasourceUid: string;
  group: { name: string; intervalSeconds: number };
  rules: AlertRuleEntry[];
  deliveryTest: AlertRuleEntry;
}
export interface GrafanaAlertRule {
  uid: string;
  title: string;
  folderUID: string;
  ruleGroup: string;
  condition: string;
  noDataState: string;
  for: string;
  // Each data entry's model is free-form Grafana query JSON.
  data: Array<{
    refId: string;
    datasourceUid: string;
    model: Record<string, unknown> & {
      expr?: string;
      conditions?: Array<{ evaluator: { type: string; params: number[] } }>;
    };
  }>;
}
export function buildRule(entry: AlertRuleEntry, config: AlertRulesConfig): GrafanaAlertRule;
export function validateConfig(config: { rules: Partial<AlertRuleEntry>[] }): string[];
export function run(options?: {
  env?: Record<string, string | undefined>;
  argv?: string[];
  fetchImpl?: (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => Promise<{ status: number; text(): Promise<string> }>;
  log?: (line: string) => void;
}): Promise<{ applied: number; empty: string[] }>;
