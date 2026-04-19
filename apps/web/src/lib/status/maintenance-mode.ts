export type MaintenanceWindowInactive = {
  readonly active: false;
};

export type MaintenanceWindowActive = {
  readonly active: true;
  readonly etaIso: string | null;
  readonly message: string;
  readonly affectedServices: readonly string[];
};

export type MaintenanceWindow = MaintenanceWindowInactive | MaintenanceWindowActive;

export const DEFAULT_MAINTENANCE_MESSAGE = 'IntelliFlow CRM is performing scheduled maintenance.';

type EnvLike = Readonly<Record<string, string | undefined>>;

function isTruthy(value: string | undefined): boolean {
  if (typeof value !== 'string') return false;
  return value.trim().toLowerCase() === 'true';
}

function parseIsoDate(value: string | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const parsed = new Date(value);
    const ms = parsed.getTime();
    if (!Number.isFinite(ms)) return null;
    return parsed.toISOString();
  } catch {
    return null;
  }
}

function parseServiceList(value: string | undefined): readonly string[] {
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function resolveEnv(env?: EnvLike): EnvLike {
  if (env) return env;
  return process.env as EnvLike;
}

export function readMaintenanceWindow(env?: EnvLike): MaintenanceWindow {
  const source = resolveEnv(env);

  if (!isTruthy(source.MAINTENANCE_MODE)) {
    return { active: false };
  }

  const messageRaw = source.MAINTENANCE_MESSAGE;
  const message =
    typeof messageRaw === 'string' && messageRaw.trim().length > 0
      ? messageRaw
      : DEFAULT_MAINTENANCE_MESSAGE;

  return {
    active: true,
    etaIso: parseIsoDate(source.MAINTENANCE_ETA),
    message,
    affectedServices: parseServiceList(source.MAINTENANCE_AFFECTED_SERVICES),
  };
}

export function isMaintenanceModeActive(env?: EnvLike): boolean {
  return readMaintenanceWindow(env).active;
}
