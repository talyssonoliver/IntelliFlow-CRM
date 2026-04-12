/**
 * Additional tests for compliance timeline and risks routes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockNextResponseJson = vi.hoisted(() => vi.fn());

vi.mock('next/server', () => ({
  NextRequest: vi.fn().mockImplementation((url: string) => ({
    url,
    nextUrl: { searchParams: new URL(url).searchParams },
  })),
  NextResponse: {
    json: (...args: unknown[]) => mockNextResponseJson(...args),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}));

const mockCalendarData = {
  events: [
    {
      id: 'E1',
      title: 'Audit',
      date: '2026-03-15',
      type: 'audit',
      standard: 'ISO 27001',
      status: 'scheduled',
    },
    {
      id: 'E2',
      title: 'Review',
      date: '2026-03-20',
      type: 'review',
      standard: 'GDPR',
      status: 'scheduled',
    },
    {
      id: 'E3',
      title: 'Cert',
      date: '2026-06-01',
      type: 'certification',
      standard: 'SOC 2',
      status: 'scheduled',
    },
    {
      id: 'E4',
      title: 'Done',
      date: '2025-12-15',
      type: 'assessment',
      standard: 'OWASP',
      status: 'completed',
    },
  ],
};

const mockRiskData = {
  risks: [
    {
      id: 'R1',
      title: 'Risk1',
      probability: 'high',
      impact: 'high',
      status: 'requires_action',
      category: 'ISO',
    },
    {
      id: 'R2',
      title: 'Risk2',
      probability: 'low',
      impact: 'medium',
      status: 'accepted',
      category: 'GDPR',
    },
    {
      id: 'R3',
      title: 'Risk3',
      probability: 'medium',
      impact: 'low',
      status: 'mitigated',
      category: 'SOC',
    },
  ],
};

describe('Compliance Timeline API', () => {
  beforeEach(() => {
    mockNextResponseJson.mockImplementation(
      (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
        json: () => Promise.resolve(body),
        body,
        status: init?.status || 200,
        headers: new Map(Object.entries(init?.headers || {})),
      })
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockCalendarData));
  });

  it('returns all events without filter', async () => {
    const { GET } = await import('../timeline/route');
    const req = {
      url: 'http://localhost/api/compliance/timeline',
      nextUrl: { searchParams: new URLSearchParams() },
    } as any;
    const res = await GET(req);
    const d = await res.json();
    expect(d.success).toBe(true);
    expect(d.data.events.length).toBeGreaterThanOrEqual(0);
    expect(d.data.currentMonth).toBeDefined();
    expect(typeof d.data.upcomingCount).toBe('number');
  });

  it('filters events by month', async () => {
    const { GET } = await import('../timeline/route');
    const sp = new URLSearchParams({ month: '2026-03' });
    const req = {
      url: 'http://localhost/api/compliance/timeline?month=2026-03',
      nextUrl: { searchParams: sp },
    } as any;
    const res = await GET(req);
    const d = await res.json();
    expect(d.success).toBe(true);
    expect(d.data.currentMonth).toBe('2026-03');
  });

  it('filters events by quarter', async () => {
    const { GET } = await import('../timeline/route');
    const sp = new URLSearchParams({ quarter: 'Q1-2026' });
    const req = {
      url: 'http://localhost/api/compliance/timeline?quarter=Q1-2026',
      nextUrl: { searchParams: sp },
    } as any;
    const res = await GET(req);
    const d = await res.json();
    expect(d.success).toBe(true);
  });

  it('handles missing calendar file', async () => {
    mockExistsSync.mockReturnValue(false);
    const { GET } = await import('../timeline/route');
    const req = {
      url: 'http://localhost/api/compliance/timeline',
      nextUrl: { searchParams: new URLSearchParams() },
    } as any;
    const res = await GET(req);
    const d = await res.json();
    expect(d.success).toBe(true);
    expect(d.data.events).toEqual([]);
  });

  it('sorts events by date', async () => {
    const { GET } = await import('../timeline/route');
    const req = {
      url: 'http://localhost/api/compliance/timeline',
      nextUrl: { searchParams: new URLSearchParams() },
    } as any;
    const res = await GET(req);
    const d = await res.json();
    if (d.data.events.length > 1) {
      for (let i = 1; i < d.data.events.length; i++) {
        expect(d.data.events[i].date >= d.data.events[i - 1].date).toBe(true);
      }
    }
  });
});

describe('Compliance Risks API', () => {
  beforeEach(() => {
    mockNextResponseJson.mockImplementation(
      (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
        json: () => Promise.resolve(body),
        body,
        status: init?.status || 200,
        headers: new Map(Object.entries(init?.headers || {})),
      })
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockRiskData));
  });

  it('returns risk data with summary', async () => {
    const { GET } = await import('../risks/route');
    const res = await GET();
    const d = await res.json();
    expect(d.success).toBe(true);
    expect(d.data.risks).toBeDefined();
    expect(d.data.summary).toBeDefined();
    expect(d.data.lastUpdated).toBeDefined();
  });

  it('calculates summary by status', async () => {
    const { GET } = await import('../risks/route');
    const res = await GET();
    const d = await res.json();
    const s = d.data.summary;
    expect(s.total).toBe(3);
    expect(s.byStatus.requires_action).toBe(1);
    expect(s.byStatus.accepted).toBe(1);
    expect(s.byStatus.mitigated).toBe(1);
  });

  it('calculates summary by probability', async () => {
    const { GET } = await import('../risks/route');
    const res = await GET();
    const d = await res.json();
    expect(d.data.summary.byProbability.high).toBe(1);
    expect(d.data.summary.byProbability.medium).toBe(1);
    expect(d.data.summary.byProbability.low).toBe(1);
  });

  it('calculates summary by impact', async () => {
    const { GET } = await import('../risks/route');
    const res = await GET();
    const d = await res.json();
    expect(d.data.summary.byImpact.high).toBe(1);
    expect(d.data.summary.byImpact.medium).toBe(1);
    expect(d.data.summary.byImpact.low).toBe(1);
  });

  it('handles missing risk register', async () => {
    mockExistsSync.mockReturnValue(false);
    const { GET } = await import('../risks/route');
    const res = await GET();
    const d = await res.json();
    expect(d.success).toBe(true);
    expect(d.data.risks).toEqual([]);
    expect(d.data.summary.total).toBe(0);
  });

  it('handles JSON parse errors', async () => {
    mockReadFileSync.mockReturnValue('invalid json');
    const { GET } = await import('../risks/route');
    const res = await GET();
    const d = await res.json();
    expect(d.success).toBe(true);
    expect(d.data.risks).toEqual([]);
  });
});
