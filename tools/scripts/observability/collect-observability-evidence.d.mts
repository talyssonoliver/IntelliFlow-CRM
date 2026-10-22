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
