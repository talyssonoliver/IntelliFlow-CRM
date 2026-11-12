// Types for backup-intelliflow-db.mjs (used by its tests).
export const IMAGE: string;
export const SCHEMAS: string[];
export const EXCLUDED_DATA: string[];
export const REQUIRED_DATA: string[];
export function parseEnvFile(filePath: string): Record<string, string>;
export function resolveDatabaseUrl(
  env?: Record<string, string | undefined>,
  files?: { ops: string; envLocal: string }
): { url: string | undefined; source: string };
export function libpqEnv(url: string): Record<string, string>;
export function parseArgs(argv: string[]): { root: string; retentionDays: number };
export function dumpName(d: Date): string;
export function pgDumpArgs(fileInContainer: string): string[];
export function tablesWithData(tocText: string): Set<string>;
export function expiredDumps(files: string[], now: Date, retentionDays: number): string[];
export interface ExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}
export function runAsync(cmd: string, args: string[], opts?: object): Promise<ExecResult>;
export function startRelay(
  host: string,
  port: string | number
): Promise<{ port: number; close: () => void }>;
export function run(options?: {
  argv?: string[];
  env?: Record<string, string | undefined>;
  now?: Date;
  probe?: (
    cmd: string,
    args: string[],
    opts?: object
  ) => { status: number | null; error?: Error; stdout?: string; stderr?: string };
  exec?: (
    cmd: string,
    args: string[],
    opts?: { env?: Record<string, string | undefined> }
  ) => Promise<ExecResult>;
  relay?: (host: string, port: string) => Promise<{ port: number; close: () => void }>;
  log?: (line: string) => void;
}): Promise<{ result: 'SUCCESS' | 'FAILURE'; [key: string]: unknown }>;
export const STALE_AFTER_HOURS: number;
export function backupFreshness(
  logText: string,
  now: Date,
  maxHours?: number
): { fresh: boolean; lastSuccessAt: string | null; ageHours: number | null };
export function check(options?: { argv?: string[]; now?: Date; log?: (line: string) => void }): {
  result: 'FRESH' | 'STALE';
  fresh: boolean;
  lastSuccessAt: string | null;
  ageHours: number | null;
};
