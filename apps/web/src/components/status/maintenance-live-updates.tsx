'use client';

import { useEffect, useRef } from 'react';
import type { MaintenanceWindow } from '@/lib/status/maintenance-mode';
import { publishStatusUpdate } from '@/lib/status/status-updater';

export type MaintenanceLiveUpdatesProps = {
  readonly maintenanceWindow: MaintenanceWindow;
};

function windowKey(w: MaintenanceWindow): string {
  if (!w.active) return 'inactive';
  return `active|${w.etaIso ?? ''}|${w.message}|${w.affectedServices.join(',')}`;
}

export function MaintenanceLiveUpdates({ maintenanceWindow }: MaintenanceLiveUpdatesProps) {
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!maintenanceWindow.active) return;
    const key = windowKey(maintenanceWindow);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    publishStatusUpdate({ maintenanceWindow });
  }, [maintenanceWindow]);

  return null;
}
