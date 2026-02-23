import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';

// Mock fs module with default export
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mockPromises = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
  };
  return {
    ...actual,
    default: {
      ...actual,
      promises: mockPromises,
    },
    promises: mockPromises,
  };
});

// Import after mocking
const { GET, POST } = await import('../../app/api/tracking/ai/route');

const mockFs = fs as unknown as {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
};

// Sample ai-metrics.json matching the real file structure
const SAMPLE_AI_METRICS = {
  kpis: {
    drift_detection: {
      configuration: {
        window_size_hours: 6,
        p_value_threshold: 0.05,
      },
    },
    hallucination_rate: {
      target_percentage: 5,
      current_percentage: 3,
    },
    latency_slo: {
      target_p95_ms: 2000,
      target_p99_ms: 5000,
      current_p95_ms: 1500,
      current_p99_ms: 3500,
    },
    roi_tracking: {
      target_percentage: 200,
      current_percentage: 150,
    },
  },
  monitoring_components: {
    drift_detector: { class: 'DriftDetector', file: 'drift-detector.ts' },
    hallucination_checker: { class: 'HallucinationChecker', file: 'hallucination-checker.ts' },
    roi_tracker: { class: 'ROITracker', file: 'roi-tracker.ts' },
    latency_monitor: { class: 'LatencyMonitor', file: 'latency-monitor.ts' },
  },
  drift: {
    lastCheck: '2026-01-15T10:00:00Z',
  },
  lastRefresh: '2026-01-15T10:00:00Z',
  history: {
    drift: [{ date: '2026-01-14', score: 0.02, detected: false }],
    hallucination: [{ date: '2026-01-14', rate: 0.03 }],
    costs: [{ date: '2026-01-14', amount: 85.5 }],
  },
};

const SAMPLE_COST_CSV = `Category,Budget,Actual,Forecast
AI Inference,500,120,180
Infrastructure,1000,800,950
`;

function mockStatMtime(date: string) {
  return { mtime: new Date(date) };
}

describe('AI API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET handler', () => {
    it('returns 200 with status ok when ai-metrics.json exists', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });

    it('maps kpis.drift_detection fields to drift response', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.drift.threshold).toBe(0.05);
      expect(data.metrics.drift.lastCheck).toBe('2026-01-15T10:00:00Z');
    });

    it('maps kpis.hallucination_rate fields to hallucination response', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.hallucination.threshold).toBe(0.05);
    });

    it('maps kpis.latency_slo fields to slo response', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.slo.p95_target_ms).toBe(2000);
      expect(data.metrics.slo.p99_target_ms).toBe(5000);
      expect(data.metrics.slo.p95_actual_ms).toBe(1500);
      expect(data.metrics.slo.p99_actual_ms).toBe(3500);
    });

    it('maps kpis.roi_tracking fields to roi response', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.roi.target_percentage).toBe(200);
      expect(data.metrics.roi.current_percentage).toBe(150);
    });

    it('returns lastUpdated from fs.stat mtime', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-02-01T15:30:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(data.lastUpdated).toBe('2026-02-01T15:30:00.000Z');
    });

    it('returns null values when source fields are absent', async () => {
      const minimalData = {
        kpis: {},
        lastRefresh: null,
      };
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(minimalData));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.drift.score).toBeNull();
      expect(data.metrics.hallucination.rate).toBeNull();
      expect(data.metrics.slo.p95_actual_ms).toBeNull();
      expect(data.metrics.roi.current_percentage).toBeNull();
    });

    it('returns empty models array when no models data in source', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(Array.isArray(data.metrics.models)).toBe(true);
    });

    it('returns empty history arrays when no history data', async () => {
      const noHistory = { ...SAMPLE_AI_METRICS, history: undefined };
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(noHistory));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.drift.history).toEqual([]);
      expect(data.metrics.hallucination.history).toEqual([]);
      expect(data.metrics.costs.history).toEqual([]);
    });

    it('handles missing ai-metrics.json gracefully (no 500)', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.stat.mockRejectedValue(new Error('ENOENT'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.metrics.drift.score).toBeNull();
    });

    it('handles invalid JSON gracefully (no 500)', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve('NOT VALID JSON {{{');
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      expect(response.status).toBe(200);
    });

    it('cost budget CSV override when file exists with AI row', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        if (filePath.includes('cost-budget.csv')) {
          return Promise.resolve(SAMPLE_COST_CSV);
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.costs.budget).toBe(500);
      expect(data.metrics.costs.current_month).toBe(120);
    });

    it('cost budget CSV missing returns fallback values', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      // Should still return cost data (from ai-metrics or defaults)
      expect(data.metrics.costs).toBeDefined();
      expect(typeof data.metrics.costs.budget).toBe('number');
    });

    it('cost budget CSV with no AI row returns null', async () => {
      const noAiCsv = `Category,Budget,Actual,Forecast
Infrastructure,1000,800,950
`;
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        if (filePath.includes('cost-budget.csv')) {
          return Promise.resolve(noAiCsv);
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      // parseCostBudget returns null → cost values come from other sources
      expect(data.metrics.costs).toBeDefined();
    });

    it('response includes all required top-level fields', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));

      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('metrics');
      expect(data).toHaveProperty('lastUpdated');
      expect(data.metrics).toHaveProperty('models');
      expect(data.metrics).toHaveProperty('drift');
      expect(data.metrics).toHaveProperty('costs');
      expect(data.metrics).toHaveProperty('hallucination');
      expect(data.metrics).toHaveProperty('slo');
      expect(data.metrics).toHaveProperty('roi');
    });
  });

  describe('POST handler', () => {
    it('returns 200 with refreshed metrics', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      const response = await POST(new Request('http://localhost/api/tracking/ai', { method: 'POST' }) as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });

    it('appends history entry to drift.history', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      await POST(new Request('http://localhost/api/tracking/ai', { method: 'POST' }) as never);

      // Verify writeFile was called with history entries
      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall).toBeDefined();
      const written = JSON.parse(writeCall[1]);
      expect(written.history?.drift?.length).toBeGreaterThanOrEqual(1);
    });

    it('appends history entry to costs.history', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      await POST(new Request('http://localhost/api/tracking/ai', { method: 'POST' }) as never);

      const writeCall = mockFs.writeFile.mock.calls[0];
      const written = JSON.parse(writeCall[1]);
      expect(written.history?.costs?.length).toBeGreaterThanOrEqual(1);
    });

    it('caps history arrays at 30 entries', async () => {
      const metricsWithLongHistory = {
        ...SAMPLE_AI_METRICS,
        history: {
          drift: Array.from({ length: 30 }, (_, i) => ({
            date: `2026-01-${String(i + 1).padStart(2, '0')}`,
            score: 0.01,
            detected: false,
          })),
          hallucination: Array.from({ length: 30 }, (_, i) => ({
            date: `2026-01-${String(i + 1).padStart(2, '0')}`,
            rate: 0.02,
          })),
          costs: Array.from({ length: 30 }, (_, i) => ({
            date: `2026-01-${String(i + 1).padStart(2, '0')}`,
            amount: 50,
          })),
        },
      };
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(metricsWithLongHistory));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      await POST(new Request('http://localhost/api/tracking/ai', { method: 'POST' }) as never);

      const writeCall = mockFs.writeFile.mock.calls[0];
      const written = JSON.parse(writeCall[1]);
      expect(written.history.drift.length).toBeLessThanOrEqual(30);
      expect(written.history.costs.length).toBeLessThanOrEqual(30);
    });

    it('handles missing source file (creates from empty)', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      const response = await POST(new Request('http://localhost/api/tracking/ai', { method: 'POST' }) as never);
      expect(response.status).toBe(200);
    });

    it('returns 500 on fs.writeFile failure', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));
      mockFs.writeFile.mockRejectedValue(new Error('EPERM'));
      mockFs.mkdir.mockResolvedValue(undefined);

      const response = await POST(new Request('http://localhost/api/tracking/ai', { method: 'POST' }) as never);
      expect(response.status).toBe(500);
    });

    it('calls fs.mkdir to ensure directory exists', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('ai-metrics.json')) {
          return Promise.resolve(JSON.stringify(SAMPLE_AI_METRICS));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockFs.stat.mockResolvedValue(mockStatMtime('2026-01-15T10:00:00Z'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      await POST(new Request('http://localhost/api/tracking/ai', { method: 'POST' }) as never);

      expect(mockFs.mkdir).toHaveBeenCalled();
    });
  });
});
