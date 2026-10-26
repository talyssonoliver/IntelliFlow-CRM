// Types for apply-railway-self-healing.mjs (used by its tests).
export interface SelfHealingSettings {
  restartPolicyType: 'ON_FAILURE' | 'ALWAYS' | 'NEVER';
  restartPolicyMaxRetries: number;
  healthcheckPath?: string;
  healthcheckTimeout?: number;
}
export const DESIRED: {
  api: Required<SelfHealingSettings>;
  'combined-worker': SelfHealingSettings;
  'ai-worker': SelfHealingSettings;
};
export const EXPECTED_API_HOST: string;
export function diffFields(
  current: Partial<Record<string, unknown>> | null | undefined,
  desired: object
): Record<string, unknown>;
export function aiWorkerHealthcheck(
  vars: { PORT?: string; HEALTH_PORT?: string } | null | undefined
): { set: true } | { set: false; reason: string };
export function combinedWorkerHealthcheck(vars: {
  PORT?: string;
  HEALTH_PORT?: string;
  COMBINED_HEALTH_PORT?: string;
}): { set: true } | { set: false; reason: string };
export function probeTarget(
  baseUrl: string | undefined
): { url: string; reason?: undefined } | { reason: string; url?: undefined };
export function run(options?: {
  env?: Record<string, string | undefined>;
  argv?: string[];
  fetchImpl?: (
    url: string,
    init: Record<string, unknown>
  ) => Promise<{ status: number; text?(): Promise<string> }>;
  log?: (line: string) => void;
  writeSummary?: (text: string) => void;
}): Promise<{ applied: boolean; notes: string[] }>;
