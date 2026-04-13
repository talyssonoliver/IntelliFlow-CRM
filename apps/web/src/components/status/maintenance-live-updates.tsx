'use client';

import { useEffect } from 'react';
import type { MaintenanceWindow } from '@/lib/status/maintenance-mode';
import { publishStatusUpdate } from '@/lib/status/status-updater';

export type MaintenanceLiveUpdatesProps = {
  readonly window: MaintenanceWindow;
};

export function MaintenanceLiveUpdates({ window }: MaintenanceLiveUpdatesProps) {
  useEffect(() => {
    if (window.active) {
      publishStatusUpdate({ window });
    }
  }, [window]);

  return null;
}
