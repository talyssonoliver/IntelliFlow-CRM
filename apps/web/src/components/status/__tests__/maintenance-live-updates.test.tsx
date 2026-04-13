// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { MaintenanceWindow } from '@/lib/status/maintenance-mode';

const publishStatusUpdate = vi.fn();

vi.mock('@/lib/status/status-updater', () => ({
  publishStatusUpdate: (...args: unknown[]) => publishStatusUpdate(...args),
}));

import { MaintenanceLiveUpdates } from '../maintenance-live-updates';

const activeWindow: MaintenanceWindow = {
  active: true,
  etaIso: '2026-08-18T04:00:00.000Z',
  startedAtIso: '2026-08-18T03:00:00.000Z',
  message: 'Upgrading database engines.',
  affectedServices: ['api'],
};

const inactiveWindow: MaintenanceWindow = { active: false };

describe('MaintenanceLiveUpdates', () => {
  beforeEach(() => {
    publishStatusUpdate.mockReset();
  });

  afterEach(() => {
    publishStatusUpdate.mockReset();
  });

  it('calls publishStatusUpdate on mount when window is active', () => {
    render(<MaintenanceLiveUpdates window={activeWindow} />);
    expect(publishStatusUpdate).toHaveBeenCalledTimes(1);
    expect(publishStatusUpdate).toHaveBeenCalledWith({ window: activeWindow });
  });

  it('does not call publishStatusUpdate when window is inactive', () => {
    render(<MaintenanceLiveUpdates window={inactiveWindow} />);
    expect(publishStatusUpdate).not.toHaveBeenCalled();
  });

  it('renders null (zero visible output)', () => {
    const { container } = render(<MaintenanceLiveUpdates window={activeWindow} />);
    expect(container.firstChild).toBeNull();
  });
});
