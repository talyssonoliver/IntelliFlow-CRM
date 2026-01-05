/**
 * Compliance API Route Tests
 *
 * Tests for compliance-related API endpoints:
 * - /api/compliance/risks
 * - /api/compliance/timeline
 * - /api/compliance/[standardId]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(),
}));

import * as fs from 'fs';

// Mock risk data
const mockRiskData = {
  risks: [
    {
      id: 'RISK-001',
      title: 'Test Risk 1',
      probability: 'high',
      impact: 'high',
      status: 'requires_action',
      category: 'ISO 42001',
      owner: 'Security Team',
      mitigationPlan: 'Implement controls',
    },
    {
      id: 'RISK-002',
      title: 'Test Risk 2',
      probability: 'low',
      impact: 'medium',
      status: 'accepted',
      category: 'GDPR',
    },
    {
      id: 'RISK-003',
      title: 'Test Risk 3',
      probability: 'medium',
      impact: 'low',
      status: 'mitigated',
      category: 'ISO 27001',
    },
  ],
  lastUpdated: '2026-01-05T10:00:00Z',
};

// Mock calendar data
const mockCalendarData = {
  events: [
    {
      id: 'EVT-001',
      title: 'ISO 27001 Annual Audit',
      date: '2026-01-15',
      type: 'audit',
      standard: 'ISO 27001',
      status: 'scheduled',
      description: 'Annual certification audit',
    },
    {
      id: 'EVT-002',
      title: 'GDPR Review',
      date: '2026-01-20',
      type: 'review',
      standard: 'GDPR',
      status: 'scheduled',
    },
    {
      id: 'EVT-003',
      title: 'SOC 2 Certification',
      date: '2025-12-15',
      type: 'certification',
      standard: 'SOC 2',
      status: 'completed',
    },
  ],
};

describe('Compliance API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/compliance/risks', () => {
    it('should return risk data with summary statistics', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRiskData));

      const { GET } = await import('../risks/route');
      const response = await GET();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.risks).toHaveLength(3);
      expect(data.data.summary).toBeDefined();
      expect(data.data.summary.total).toBe(3);
    });

    it('should calculate summary by status correctly', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRiskData));

      const { GET } = await import('../risks/route');
      const response = await GET();
      const data = await response.json();

      expect(data.data.summary.byStatus.requires_action).toBe(1);
      expect(data.data.summary.byStatus.accepted).toBe(1);
      expect(data.data.summary.byStatus.mitigated).toBe(1);
    });

    it('should calculate summary by probability correctly', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRiskData));

      const { GET } = await import('../risks/route');
      const response = await GET();
      const data = await response.json();

      expect(data.data.summary.byProbability.high).toBe(1);
      expect(data.data.summary.byProbability.medium).toBe(1);
      expect(data.data.summary.byProbability.low).toBe(1);
    });

    it('should calculate summary by impact correctly', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRiskData));

      const { GET } = await import('../risks/route');
      const response = await GET();
      const data = await response.json();

      expect(data.data.summary.byImpact.high).toBe(1);
      expect(data.data.summary.byImpact.medium).toBe(1);
      expect(data.data.summary.byImpact.low).toBe(1);
    });

    it('should handle missing data file gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Re-import to get fresh module
      vi.resetModules();
      const { GET } = await import('../risks/route');
      const response = await GET();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.risks).toEqual([]);
    });
  });

  describe('GET /api/compliance/timeline', () => {
    it('should return all events without filter', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCalendarData));

      const { GET } = await import('../timeline/route');
      const request = new NextRequest('http://localhost/api/compliance/timeline');
      const response = await GET(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.events).toHaveLength(3);
    });

    it('should filter events by month', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCalendarData));

      const { GET } = await import('../timeline/route');
      const request = new NextRequest('http://localhost/api/compliance/timeline?month=2026-01');
      const response = await GET(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      // Only January 2026 events
      expect(data.data.events.every((e: { date: string }) => e.date.startsWith('2026-01'))).toBe(true);
    });

    it('should return currentMonth in response', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCalendarData));

      const { GET } = await import('../timeline/route');
      const request = new NextRequest('http://localhost/api/compliance/timeline?month=2026-01');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.currentMonth).toBe('2026-01');
    });

    it('should count upcoming events correctly', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCalendarData));

      const { GET } = await import('../timeline/route');
      const request = new NextRequest('http://localhost/api/compliance/timeline');
      const response = await GET(request);
      const data = await response.json();

      expect(typeof data.data.upcomingCount).toBe('number');
    });
  });

  describe('GET /api/compliance/[standardId]', () => {
    it('should return detail data for iso-27001', async () => {
      const { GET } = await import('../[standardId]/route');
      const request = new NextRequest('http://localhost/api/compliance/iso-27001');
      const response = await GET(request, { params: Promise.resolve({ standardId: 'iso-27001' }) });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.standardId).toBe('iso-27001');
      expect(data.data.standardName).toBe('ISO 27001');
      expect(data.data.controls).toBeDefined();
      expect(Array.isArray(data.data.controls)).toBe(true);
    });

    it('should return detail data for gdpr', async () => {
      const { GET } = await import('../[standardId]/route');
      const request = new NextRequest('http://localhost/api/compliance/gdpr');
      const response = await GET(request, { params: Promise.resolve({ standardId: 'gdpr' }) });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.standardId).toBe('gdpr');
      expect(data.data.standardName).toBe('GDPR');
    });

    it('should return detail data for soc-2', async () => {
      const { GET } = await import('../[standardId]/route');
      const request = new NextRequest('http://localhost/api/compliance/soc-2');
      const response = await GET(request, { params: Promise.resolve({ standardId: 'soc-2' }) });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.standardId).toBe('soc-2');
      expect(data.data.standardName).toBe('SOC 2');
    });

    it('should return detail data for owasp', async () => {
      const { GET } = await import('../[standardId]/route');
      const request = new NextRequest('http://localhost/api/compliance/owasp');
      const response = await GET(request, { params: Promise.resolve({ standardId: 'owasp' }) });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.standardId).toBe('owasp');
      expect(data.data.standardName).toBe('OWASP Top 10');
    });

    it('should return 404 for unknown standard', async () => {
      const { GET } = await import('../[standardId]/route');
      const request = new NextRequest('http://localhost/api/compliance/unknown-standard');
      const response = await GET(request, { params: Promise.resolve({ standardId: 'unknown-standard' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Standard not found');
    });

    it('should include historical scores', async () => {
      const { GET } = await import('../[standardId]/route');
      const request = new NextRequest('http://localhost/api/compliance/iso-27001');
      const response = await GET(request, { params: Promise.resolve({ standardId: 'iso-27001' }) });
      const data = await response.json();

      expect(data.data.historicalScores).toBeDefined();
      expect(Array.isArray(data.data.historicalScores)).toBe(true);
      expect(data.data.historicalScores.length).toBeGreaterThan(0);

      // Each historical score should have date and score
      data.data.historicalScores.forEach((score: { date: string; score: number }) => {
        expect(score).toHaveProperty('date');
        expect(score).toHaveProperty('score');
        expect(typeof score.score).toBe('number');
      });
    });

    it('should include recent changes', async () => {
      const { GET } = await import('../[standardId]/route');
      const request = new NextRequest('http://localhost/api/compliance/iso-27001');
      const response = await GET(request, { params: Promise.resolve({ standardId: 'iso-27001' }) });
      const data = await response.json();

      expect(data.data.recentChanges).toBeDefined();
      expect(Array.isArray(data.data.recentChanges)).toBe(true);

      // Each change should have action, date, and user
      data.data.recentChanges.forEach((change: { action: string; date: string; user: string }) => {
        expect(change).toHaveProperty('action');
        expect(change).toHaveProperty('date');
        expect(change).toHaveProperty('user');
      });
    });

    it('should include control statuses', async () => {
      const { GET } = await import('../[standardId]/route');
      const request = new NextRequest('http://localhost/api/compliance/iso-27001');
      const response = await GET(request, { params: Promise.resolve({ standardId: 'iso-27001' }) });
      const data = await response.json();

      expect(data.data.controls).toBeDefined();

      // Each control should have required properties
      data.data.controls.forEach((control: { id: string; name: string; status: string }) => {
        expect(control).toHaveProperty('id');
        expect(control).toHaveProperty('name');
        expect(control).toHaveProperty('status');
        expect(['passed', 'failed', 'in_progress', 'not_applicable']).toContain(control.status);
      });
    });
  });
});
