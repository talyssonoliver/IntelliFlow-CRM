// Types for collect-observability-evidence.mjs (used by its tests).
export interface CollectorOptions {
  services: string[];
  logWindowDays: number;
  alertWindowDays: number;
  maxTraces: number;
  since: Date | undefined;
  outDir: string;
  dryRun: boolean;
}
export interface AlertTransition {
  t: number;
  ruleUID: string;
  service: string;
  alertname: string;
  previous: string;
  current: string;
}
export const EXCLUSION_REASONS: { deliveryTest: string; assertsUp: string };
export function parseArgs(argv: string[]): CollectorOptions;
export function sanitizeSpanName(name: string): string;
export function splitIncidents<T extends { t: number }>(transitions: T[]): T[][];
export interface EpisodeIncident {
  rule_uid: string;
  service: string;
  t_alerting: string;
  anchored: boolean;
  t_first_error?: string;
  first_error_trace_id?: string;
}
export interface ErrorEpisode {
  service: string;
  t_first_error: string;
  first_error_trace_id: string;
  t_detected: string;
  detected_by: string;
  mttd_s: number;
  incidents: number;
  rule_uids: string[];
  /** Committed rules whose query was true 120 s after the first error (set by run). */
  repo_rules_true_at_120s?: string[];
}
export interface RepoRuleCheck {
  uid: string;
  transitions_by_state: Record<string, number>;
  live: { health: string; state: string; has_last_error: boolean } | null;
  condition: {
    lookback_s: number;
    steps_true_by_service: Array<{ service: string; steps: number }>;
  };
}
export function groupEpisodes(incidents: EpisodeIncident[]): ErrorEpisode[];
export function run(options?: {
  env?: Record<string, string | undefined>;
  argv?: string[];
  fetchImpl?: (
    url: string,
    init: { method: string; headers: Record<string, string> }
  ) => Promise<{
    status: number;
    headers?: { get(name: string): string | null };
    text(): Promise<string>;
  }>;
  log?: (line: string) => void;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  readFile?: (file: string, encoding: 'utf8') => Promise<string>;
  writeFile?: (file: string, data: string) => Promise<void>;
  rename?: (from: string, to: string) => Promise<void>;
  unlink?: (file: string) => Promise<void>;
}): Promise<0 | 1 | 2>;
