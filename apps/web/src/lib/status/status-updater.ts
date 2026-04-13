import type { MaintenanceWindow } from './maintenance-mode';

export type MaintenanceStatusUpdatePayload = {
  readonly event: 'status_update';
  readonly mode: 'maintenance';
  readonly active: boolean;
  readonly etaIso: string | null;
  readonly message: string;
  readonly affectedServices: readonly string[];
  readonly timestamp: string;
};

export type MaintenanceStatusInput = {
  readonly window: MaintenanceWindow;
  readonly timestamp?: string;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const NO_MAINTENANCE_MESSAGE = 'No maintenance currently scheduled.';

export function buildMaintenanceStatusPayload(
  input: MaintenanceStatusInput
): MaintenanceStatusUpdatePayload {
  const timestamp = input.timestamp ?? new Date().toISOString();

  if (!input.window.active) {
    return {
      event: 'status_update',
      mode: 'maintenance',
      active: false,
      etaIso: null,
      message: NO_MAINTENANCE_MESSAGE,
      affectedServices: [],
      timestamp,
    };
  }

  return {
    event: 'status_update',
    mode: 'maintenance',
    active: true,
    etaIso: input.window.etaIso,
    message: input.window.message,
    affectedServices: input.window.affectedServices,
    timestamp,
  };
}

export function publishStatusUpdate(input: MaintenanceStatusInput): MaintenanceStatusUpdatePayload {
  const payload = buildMaintenanceStatusPayload(input);

  if (typeof window !== 'undefined') {
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(payload);
    }

    window.dispatchEvent(
      new CustomEvent<MaintenanceStatusUpdatePayload>('intelliflow:status-update', {
        detail: payload,
      })
    );
  }

  return payload;
}
