// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { MaintenanceWindow } from '@/lib/status/maintenance-mode';
import { MaintenanceContent } from '../maintenance-content';

const activeWindow: MaintenanceWindow = {
  active: true,
  etaIso: '2026-08-18T04:00:00.000Z',
  message: 'Upgrading database engines.',
  affectedServices: ['api', 'worker'],
};

describe('MaintenanceContent', () => {
  it('renders the inactive state when window.active is false', () => {
    render(<MaintenanceContent maintenanceWindow={{ active: false }} />);

    expect(
      screen.getByRole('heading', { name: /no maintenance currently scheduled/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/estimated completion/i)).not.toBeInTheDocument();
  });

  it('renders ETA, message, and affected services when active', () => {
    render(<MaintenanceContent maintenanceWindow={activeWindow} />);

    expect(screen.getByRole('heading', { name: /scheduled maintenance/i })).toBeInTheDocument();
    expect(screen.getByText('Upgrading database engines.')).toBeInTheDocument();
    expect(screen.getByText(/estimated completion/i)).toBeInTheDocument();

    const services = screen.getByText(/affected services/i).parentElement;
    expect(services).not.toBeNull();
    if (services) {
      expect(within(services).getByText('api')).toBeInTheDocument();
      expect(within(services).getByText('worker')).toBeInTheDocument();
    }
  });

  it('marks the status region with aria-live="polite"', () => {
    const { container } = render(<MaintenanceContent maintenanceWindow={activeWindow} />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });

  it('renders recovery links to /status and /', () => {
    render(<MaintenanceContent maintenanceWindow={activeWindow} />);
    expect(screen.getByRole('link', { name: /check status page/i })).toHaveAttribute(
      'href',
      '/status'
    );
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });

  it('falls back to "ETA unavailable" when etaIso is null', () => {
    render(
      <MaintenanceContent
        maintenanceWindow={{
          active: true,
          etaIso: null,
          message: 'Investigating.',
          affectedServices: [],
        }}
      />
    );
    expect(screen.getByText(/eta unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/no services listed/i)).toBeInTheDocument();
  });
});
