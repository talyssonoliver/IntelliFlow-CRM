// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { RecentActivityWidget } from '../RecentActivityWidget';

const activityMock = vi.fn();
const healthMock = vi.fn();

// Mock path should match what the component imports (relative to component location)
// The component is at widgets/, hooks are at apps/web/hooks/
vi.mock('../../../../../hooks/use-subscription', () => ({
  useActivitySubscription: (...args: unknown[]) => activityMock(...args),
  useRealtimeHealth: () => healthMock(),
}));

const sampleActivity = {
  id: '1',
  type: 'EMAIL',
  title: 'Sent proposal',
  description: 'Follow-up email sent',
  timestamp: new Date().toISOString(),
  dateLabel: 'today',
  opportunityId: null,
  userId: null,
  agentName: null,
  agentStatus: null,
};

describe('RecentActivityWidget', () => {
  beforeEach(() => {
    activityMock.mockReset();
    healthMock.mockReset();
    activityMock.mockReturnValue({
      activities: [sampleActivity],
      status: 'connected',
      metrics: { averageLatency: 12, messagesReceived: 1 },
    });
    healthMock.mockReturnValue({ isHealthy: true, latency: 10, lastPing: Date.now() });
  });

  it('renders activity feed with connection status', () => {
    render(<RecentActivityWidget />);

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText(/Sent proposal/i)).toBeInTheDocument();
  });

  it('shows empty state when no realtime activities are available', () => {
    activityMock.mockReturnValue({
      activities: [],
      status: 'connected',
      metrics: { averageLatency: 8, messagesReceived: 0 },
    });

    render(<RecentActivityWidget />);

    expect(screen.getByText('No recent activity yet.')).toBeInTheDocument();
    expect(screen.getByText('Waiting for new activities...')).toBeInTheDocument();
  });
});
