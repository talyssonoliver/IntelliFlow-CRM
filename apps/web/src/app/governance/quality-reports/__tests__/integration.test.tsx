/**
 * Quality Reports Page Integration Tests
 *
 * Tests for the governance quality reports page with MSW mocking.
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Mock data
const mockQualityReports = {
  reports: [
    {
      id: 'lighthouse',
      name: 'Lighthouse Performance',
      type: 'lighthouse',
      status: 'passing',
      score: 92,
      generatedAt: new Date().toISOString(),
      source: 'ci',
    },
    {
      id: 'coverage',
      name: 'Test Coverage',
      type: 'coverage',
      status: 'passing',
      score: 85,
      generatedAt: new Date().toISOString(),
      source: 'ci',
    },
    {
      id: 'performance',
      name: 'Performance Benchmarks',
      type: 'performance',
      status: 'passing',
      score: 88,
      generatedAt: new Date().toISOString(),
      source: 'ci',
    },
  ],
  lastUpdated: new Date().toISOString(),
  overallHealth: 'good' as const,
};

// Create inline handlers
const handlers = [
  http.get('/api/quality-reports', ({ request }) => {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'summary';

    if (action === 'summary') {
      return HttpResponse.json({
        success: true,
        data: mockQualityReports,
      });
    }

    return HttpResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  }),

  http.post('/api/quality-reports/test-run', async ({ request }) => {
    const body = await request.json() as { scope?: string; coverage?: boolean };
    const runId = `test-mock-${Date.now()}`;
    const scope = body.scope ?? 'all';
    const withCoverage = body.coverage ?? false;

    return HttpResponse.json({
      success: true,
      runId,
      statusUrl: `/api/quality-reports/test-run/${runId}`,
      eventsUrl: `/api/quality-reports/test-run/events?runId=${runId}`,
      state: {
        runId,
        scope,
        withCoverage,
        status: 'running',
        progress: {
          testsRun: 0,
          testsPassed: 0,
          testsFailed: 0,
          testsSkipped: 0,
        },
        startedAt: new Date().toISOString(),
      },
    });
  }),

  http.get('/api/quality-reports/test-run', () => {
    return HttpResponse.json({
      success: true,
      count: 0,
      runs: [],
    });
  }),
];

// Create MSW server
const server = setupServer(...handlers);

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/governance/quality-reports',
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock EventSource for SSE
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = MockEventSource.CONNECTING;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}

(global as Record<string, unknown>).EventSource = MockEventSource;

// Start MSW server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Import the page component after mocks are set up
import QualityReportsPage from '../page';

describe('QualityReportsPage', () => {
  beforeEach(() => {
    // Reset MSW handlers to defaults
    server.resetHandlers();
    // Clear localStorage
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  describe('Initial Render', () => {
    it('renders the page header with correct title', async () => {
      render(<QualityReportsPage />);

      expect(screen.getByRole('heading', { name: 'Quality Reports' })).toBeInTheDocument();
      expect(
        screen.getByText('CI-generated quality reports for Lighthouse, test coverage, and performance')
      ).toBeInTheDocument();
    });

    it('displays the Run Tests button', async () => {
      render(<QualityReportsPage />);

      expect(screen.getByRole('button', { name: /run tests/i })).toBeInTheDocument();
    });

    it('displays the Generate Reports button', async () => {
      render(<QualityReportsPage />);

      expect(screen.getByRole('button', { name: /generate reports/i })).toBeInTheDocument();
    });
  });

  describe('Quality Reports Display', () => {
    it('displays quality reports from API', async () => {
      render(<QualityReportsPage />);

      // Wait for reports to load
      await waitFor(() => {
        expect(screen.getByText('Lighthouse Performance')).toBeInTheDocument();
      });

      expect(screen.getByText('Test Coverage')).toBeInTheDocument();
      expect(screen.getByText('Performance Benchmarks')).toBeInTheDocument();
    });

    it('displays summary stats cards', async () => {
      render(<QualityReportsPage />);

      await waitFor(() => {
        expect(screen.getByText('Total Reports')).toBeInTheDocument();
      });

      expect(screen.getByText('Passing')).toBeInTheDocument();
      expect(screen.getByText('Failing')).toBeInTheDocument();
      // "CI Generated" appears multiple times (stats card + report cards)
      expect(screen.getAllByText('CI Generated').length).toBeGreaterThan(0);
    });

    it('handles API error gracefully', async () => {
      // Override handler to return error
      server.use(
        http.get('/api/quality-reports', () => {
          return HttpResponse.json(
            { success: false, error: 'Server error' },
            { status: 500 }
          );
        })
      );

      render(<QualityReportsPage />);

      // Should not crash and still show header
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Quality Reports' })).toBeInTheDocument();
      });
    });
  });

  describe('Test Runner Modal', () => {
    it('opens test runner modal when Run Tests is clicked', async () => {
      const user = userEvent.setup();
      render(<QualityReportsPage />);

      const runTestsButton = screen.getByRole('button', { name: /run tests/i });
      await user.click(runTestsButton);

      // Modal should appear with scope options
      await waitFor(() => {
        expect(screen.getByText('Test Scope')).toBeInTheDocument();
      });

      expect(screen.getByText('Quick')).toBeInTheDocument();
      expect(screen.getByText('Standard')).toBeInTheDocument();
      expect(screen.getByText('Comprehensive')).toBeInTheDocument();
    });

    it('shows coverage checkbox option', async () => {
      const user = userEvent.setup();
      render(<QualityReportsPage />);

      await user.click(screen.getByRole('button', { name: /run tests/i }));

      await waitFor(() => {
        expect(screen.getByText('Generate coverage report')).toBeInTheDocument();
      });
    });
  });

  describe('Generate Reports Modal', () => {
    it('opens generate reports modal when button is clicked', async () => {
      const user = userEvent.setup();
      render(<QualityReportsPage />);

      const generateButton = screen.getByRole('button', { name: /generate reports/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(screen.getByText('Generate Quality Reports')).toBeInTheDocument();
      });
    });

    it('shows report scope options', async () => {
      const user = userEvent.setup();
      render(<QualityReportsPage />);

      await user.click(screen.getByRole('button', { name: /generate reports/i }));

      await waitFor(() => {
        expect(screen.getByText('Report Scope')).toBeInTheDocument();
      });

      // Should show scope options (lowercase in generate modal)
      expect(screen.getByText('quick')).toBeInTheDocument();
    });
  });
});

describe('MSW Integration', () => {
  it('MSW server is configured and intercepting requests', async () => {
    // Test that MSW is properly intercepting the quality reports API
    const response = await fetch('/api/quality-reports?action=summary');
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data.reports).toHaveLength(3);
    expect(data.data.reports[0].name).toBe('Lighthouse Performance');
  });

  it('test run POST endpoint works with MSW', async () => {
    const response = await fetch('/api/quality-reports/test-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'quick', coverage: true }),
    });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.runId).toBeDefined();
    expect(data.state.status).toBe('running');
  });
});
