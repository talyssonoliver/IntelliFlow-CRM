// Types for apply-grafana-ai-alert-rules.mjs (used by its tests).
export interface AiAlertRuleEntry {
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
  requireSeries?: boolean;
}
export interface AiAlertRulesConfig {
  folder: { uid: string; title: string };
  datasourceUid: string;
  group: { name: string; intervalSeconds: number };
  rules: AiAlertRuleEntry[];
}
export interface GrafanaAlertRule {
  uid: string;
  title: string;
  folderUID: string;
  ruleGroup: string;
  condition: string;
  noDataState: string;
  for: string;
  labels: Record<string, string>;
  data: Array<{ refId: string; datasourceUid: string; model: Record<string, unknown> }>;
}
export const RULES_PATH: string;
export const SAFE_PATH_SEGMENT: RegExp;
export function extractConstRegexSource(sourceText: string, name: string): string;
export function redactText(text: unknown, token?: string): string;
export function buildRule(entry: AiAlertRuleEntry, config: AiAlertRulesConfig): GrafanaAlertRule;
export function validateConfig(
  config: Record<string, unknown> & { rules?: Partial<AiAlertRuleEntry>[] }
): string[];
export function run(options?: {
  env?: Record<string, string | undefined>;
  argv?: string[];
  fetchImpl?: (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => Promise<{ status: number; text(): Promise<string> }>;
  log?: (line: string) => void;
  rulesPath?: string;
}): Promise<{ applied: number; empty: string[] }>;
export function metricNames(expr: string): string[];
export function labelNames(expr: string): string[];
