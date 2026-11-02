// Types for apply-grafana-slos.mjs (used by its tests).
export interface SloLabel {
  key: string;
  value: string;
}
export interface SloQuery {
  type: 'ratio' | 'freeform';
  ratio?: {
    successMetric: { prometheusMetric: string };
    totalMetric: { prometheusMetric: string };
  };
  freeform?: { query: string };
}
export interface SloAlertingMetadata {
  labels?: SloLabel[];
  annotations?: SloLabel[];
}
export interface SloEntry {
  uuid: string;
  name: string;
  description: string;
  query: SloQuery;
  objectives: Array<{ value: number; window: string }>;
  labels?: SloLabel[];
  alerting?: { fastBurn?: SloAlertingMetadata; slowBurn?: SloAlertingMetadata };
}
export interface SlosConfig {
  folderUid: string;
  destinationDatasourceUid: string;
  slos: SloEntry[];
}
export function validateConfig(config: {
  folderUid?: string;
  destinationDatasourceUid?: string;
  slos?: Array<Partial<SloEntry>>;
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
}): Promise<{ created: number; updated: number; dryRun: boolean }>;
