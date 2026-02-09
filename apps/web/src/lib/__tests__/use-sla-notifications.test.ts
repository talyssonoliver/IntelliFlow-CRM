import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const mgr = {
    initialize: vi.fn(),
    dispose: vi.fn(),
    onNotification: vi.fn(() => vi.fn()),
  };
  return { mgr };
});

vi.mock('../../../lib/tickets/sla-notifications', () => {
  function SLANotificationManager() { return hoisted.mgr; }
  return { SLANotificationManager };
});

vi.mock('../../../lib/tickets/sla-service', () => ({
  slaTrackingService: { onBreach: vi.fn(), onWarning: vi.fn() },
}));

vi.mock('react', () => ({
  useEffect: vi.fn((fn: () => any) => { fn(); }),
  useRef: vi.fn((initial: any) => ({ current: initial })),
}));

import { useSLANotifications, useSLANotificationListener } from '../../../lib/tickets/use-sla-notifications';

describe('useSLANotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mgr.initialize.mockClear();
    hoisted.mgr.dispose.mockClear();
    hoisted.mgr.onNotification.mockReturnValue(vi.fn());
  });

  it('returns manager or null', () => {
    const result = useSLANotifications();
    expect(result === null || (result as any) === hoisted.mgr).toBe(true);
  });

  it('initializes manager', () => {
    useSLANotifications();
    expect(hoisted.mgr.initialize).toHaveBeenCalled();
  });

  it('accepts custom config', () => {
    useSLANotifications({ channels: ['webhook'] as any });
    expect(hoisted.mgr.initialize).toHaveBeenCalled();
  });
});

describe('useSLANotificationListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mgr.initialize.mockClear();
    hoisted.mgr.dispose.mockClear();
    hoisted.mgr.onNotification.mockReturnValue(vi.fn());
  });

  it('is a function', () => {
    expect(typeof useSLANotificationListener).toBe('function');
  });

  it('does not throw', () => {
    expect(() => useSLANotificationListener(vi.fn())).not.toThrow();
  });
});
