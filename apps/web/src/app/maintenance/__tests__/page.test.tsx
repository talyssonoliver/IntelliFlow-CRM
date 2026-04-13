// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const liveUpdatesMock = vi.fn((_props: unknown) => null);

vi.mock('@/components/status/maintenance-live-updates', () => ({
  MaintenanceLiveUpdates: (props: unknown) => liveUpdatesMock(props),
}));

import MaintenancePage, { dynamic, metadata } from '../page';

describe('MaintenancePage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    liveUpdatesMock.mockClear();
    process.env = { ...originalEnv };
    delete process.env.MAINTENANCE_MODE;
    delete process.env.MAINTENANCE_ETA;
    delete process.env.MAINTENANCE_MESSAGE;
    delete process.env.MAINTENANCE_AFFECTED_SERVICES;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('exports metadata aligned with a non-indexable system page', () => {
    expect(metadata.title).toBe('Scheduled Maintenance | IntelliFlow CRM');
    expect(metadata.alternates?.canonical).toBe('/maintenance');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('exports dynamic = force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('renders the inactive state and does NOT mount MaintenanceLiveUpdates when env is unset', () => {
    render(<MaintenancePage />);
    expect(
      screen.getByRole('heading', { name: /no maintenance currently scheduled/i })
    ).toBeInTheDocument();
    expect(liveUpdatesMock).not.toHaveBeenCalled();
  });

  it('renders the active state with env-driven message, ETA, and affected services', () => {
    process.env.MAINTENANCE_MODE = 'true';
    process.env.MAINTENANCE_ETA = '2026-08-18T04:00:00.000Z';
    process.env.MAINTENANCE_MESSAGE = 'Upgrading database engines.';
    process.env.MAINTENANCE_AFFECTED_SERVICES = 'api,worker';

    render(<MaintenancePage />);

    expect(screen.getByRole('heading', { name: /scheduled maintenance/i })).toBeInTheDocument();
    expect(screen.getByText('Upgrading database engines.')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
    expect(screen.getByText('worker')).toBeInTheDocument();
    expect(liveUpdatesMock).toHaveBeenCalledTimes(1);
  });
});
