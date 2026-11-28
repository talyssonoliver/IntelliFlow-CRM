// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListActive = vi.fn();
const seenConfigs: Array<{ sections: Array<{ title?: string; items: Array<{ label: string }> }> }> =
  [];

vi.mock('next/navigation', () => ({
  usePathname: () => '/calendar',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    calendar: {
      eventTypes: {
        listActive: {
          useQuery: (...args: unknown[]) =>
            (mockListActive as (...params: unknown[]) => unknown)(...args),
        },
      },
    },
  },
}));

vi.mock('@/hooks/useCalendarVisibility', () => ({
  CalendarVisibilityProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/components/calendar/CalendarSettingsPanel', () => ({
  CalendarSettingsPanel: () => null,
}));
vi.mock('@/components/calendar/CalendarSettingsSidebarNav', () => ({
  CalendarSettingsSidebarNav: () => null,
}));

vi.mock('@/components/sidebar', () => ({
  SidebarProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  SidebarInset: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  SidebarTrigger: () => <button type="button">Toggle sidebar</button>,
  SidebarPortalProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div>{children}</div>
  ),
  SidebarPortalTarget: () => null,
  SidebarWithSuspense: ({ config }: { config: (typeof seenConfigs)[number] }) => {
    seenConfigs.push(config);
    return <aside>Calendar sidebar</aside>;
  },
}));

const { default: CalendarLayoutShell } = await import('../_layout-shell');

describe('CalendarLayoutShell By Type', () => {
  beforeEach(() => {
    seenConfigs.length = 0;
  });

  it('builds By Type from the tenant event types', () => {
    mockListActive.mockReturnValue({
      data: [{ id: 'e1', name: 'Discovery call', appointmentType: 'CALL' }],
    });
    render(
      <CalendarLayoutShell>
        <div>content</div>
      </CalendarLayoutShell>
    );
    expect(screen.getByText('content')).toBeInTheDocument();
    const last = seenConfigs.at(-1)!;
    const typeSection = last.sections.find((s) => s.title === 'By Type');
    expect(typeSection?.items.map((i) => i.label)).toEqual(['Discovery call']);
  });

  it('shows no By Type section while the tenant has no event types', () => {
    mockListActive.mockReturnValue({ data: undefined });
    render(
      <CalendarLayoutShell>
        <div>content</div>
      </CalendarLayoutShell>
    );
    expect(seenConfigs.at(-1)!.sections.some((s) => s.title === 'By Type')).toBe(false);
  });
});
