// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { RecentActivityWidget } from '../RecentActivityWidget';

const activityMock = vi.fn();
const healthMock = vi.fn();

vi.mock('../../../../hooks/use-subscription', () => ({
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
    expect(screen.getByText('Sent proposal')).toBeInTheDocument();
    expect(screen.getByText(/Live/)).toBeInTheDocument();
  });

  it('shows fallback hint when awaiting realtime data', () => {
    activityMock.mockReturnValue({
      activities: [],
      status: 'connected',
      metrics: { averageLatency: 0, messagesReceived: 0 },
    });

    render(<RecentActivityWidget />);

    expect(screen.getByText(/Waiting for new activities/i)).toBeInTheDocument();
  });
});
