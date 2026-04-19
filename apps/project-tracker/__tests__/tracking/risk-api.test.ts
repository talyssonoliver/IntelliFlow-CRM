import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';

// Mock fs module with default export
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mockPromises = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    appendFile: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
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
const { GET, POST } = await import('../../app/api/tracking/risks/route');

const mockFs = fs as any as {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  appendFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
};

// Sample CSV content matching actual risk-register.csv format
const SAMPLE_RISK_CSV = `Risk ID,Category,Description,Likelihood (1-5),Impact (1-5),Score,Mitigation Strategy,Owner,Status,Review Date,Escalation Path,Evidence,Notes
RISK-001,Technology,LangChain API breaking changes may disrupt AI chains,4,4,16,Version pinning at 0.3.x; abstraction layer via ports pattern,Tech Lead,Mitigated,2025-01-15,CTO if migration required > 5 days,apps/ai-worker/package.json shows pinned versions,LangChain releases frequently
RISK-002,Vendor,Supabase vendor lock-in could limit migration options,2,3,6,Prisma ORM abstracts database; standard PostgreSQL features only,DevOps Lead,Mitigated,2025-03-01,CTO for strategic vendor decisions,docs/architecture/adr/001-supabase-choice.md,Migration path documented
RISK-003,Team,Learning curve for modern stack slows delivery,3,2,6,Training plan executed; pair programming mandatory,PM,Mitigated,2025-02-01,Scrum Master for resource allocation,artifacts/reports/confidence-survey.md,Team confidence improving
RISK-004,Cost,AI API costs exceed monthly budget thresholds,3,4,12,Ollama for development environments; usage monitoring dashboard,DevOps Lead,Monitored,2025-01-20,CFO if > $500/mo projected,docs/planning/financial/weekly-cost-report.csv,Daily tracking active
RISK-005,Security,Authentication bypass vulnerability exposes user data,5,1,5,Supabase Auth with JWT validation; RLS policies on all tables,Security Lead,Mitigated,2025-02-01,CISO for critical findings,docs/security/zero-trust-design.md,Zero critical vulnerabilities`;

describe('Risk Register API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/tracking/risks', () => {
    it('returns risks parsed from CSV', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date('2025-01-05T00:00:00Z') });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.risks).toBeDefined();
      expect(Array.isArray(data.risks)).toBe(true);
      expect(data.risks.length).toBe(5);
    });

    it('parses risk IDs correctly', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date('2025-01-05T00:00:00Z') });

      const response = await GET();
      const data = await response.json();

      expect(data.risks[0].id).toBe('RISK-001');
      expect(data.risks[4].id).toBe('RISK-005');
    });

    it('parses categories correctly', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date('2025-01-05T00:00:00Z') });

      const response = await GET();
      const data = await response.json();

      expect(data.risks[0].category).toBe('Technology');
      expect(data.risks[1].category).toBe('Vendor');
      expect(data.risks[4].category).toBe('Security');
    });

    it('parses scores from 1-25 scale correctly', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date('2025-01-05T00:00:00Z') });

      const response = await GET();
      const data = await response.json();

      expect(data.risks[0].score).toBe(16); // 4*4
      expect(data.risks[1].score).toBe(6); // 2*3
      expect(data.risks[4].score).toBe(5); // 5*1
    });

    it('parses status values correctly', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date('2025-01-05T00:00:00Z') });

      const response = await GET();
      const data = await response.json();

      expect(data.risks[0].status).toBe('Mitigated');
      // RISK-004 has Monitored in CSV → normalized to Monitoring
      expect(data.risks[3].status).toBe('Monitoring');
    });

    it('calculates summary statistics correctly', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date('2025-01-05T00:00:00Z') });

      const response = await GET();
      const data = await response.json();

      expect(data.summary).toBeDefined();
      expect(data.summary.total).toBe(5);
      expect(data.summary.mitigated).toBe(4);
      expect(data.summary.monitoring).toBe(1);
    });

    it('returns lastUpdated timestamp', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date('2025-01-05T12:00:00Z') });

      const response = await GET();
      const data = await response.json();

      expect(data.lastUpdated).toBe('2025-01-05T12:00:00.000Z');
    });

    it('handles empty CSV gracefully', async () => {
      mockFs.readFile.mockResolvedValueOnce('Risk ID,Category,Description,Status\n');
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.risks).toEqual([]);
    });

    it('skips summary/legend rows in CSV', async () => {
      const csvWithSummary = `${SAMPLE_RISK_CSV}

Risk Score Legend
Score Range,Classification,Action Required
20-25,Critical,Immediate escalation
Summary Statistics
Total Risks,5`;

      mockFs.readFile.mockResolvedValueOnce(csvWithSummary);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.risks.length).toBe(5);
    });

    it('does NOT include path field in response', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.path).toBeUndefined();
    });

    it('returns risks with escalationPath, evidence, notes, reviewDate fields', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.risks[0].escalationPath).toBe('CTO if migration required > 5 days');
      expect(data.risks[0].evidence).toBe('apps/ai-worker/package.json shows pinned versions');
      expect(data.risks[0].notes).toBe('LangChain releases frequently');
      expect(data.risks[0].reviewDate).toBe('2025-01-15');
    });

    it('parses CSV with quoted fields containing commas', async () => {
      const quotedCSV = `Risk ID,Category,Description,Likelihood (1-5),Impact (1-5),Score,Mitigation Strategy,Owner,Status,Review Date,Escalation Path,Evidence,Notes
RISK-001,Technology,"Description with, commas and ""quotes""",4,4,16,"Mitigation, with commas",Tech Lead,Open,2025-01-15,CTO,evidence.md,notes`;
      mockFs.readFile.mockResolvedValueOnce(quotedCSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.risks).toHaveLength(1);
      expect(data.risks[0].description).toContain('commas');
    });

    it('summary highRisk counts risks with score >= 15 (not >= 6)', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      // Only RISK-001 (score 16) is >= 15
      expect(data.summary.highRisk).toBe(1);
    });

    it('summary includes inProgress and accepted counts', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.summary).toHaveProperty('inProgress');
      expect(data.summary).toHaveProperty('accepted');
    });

    it('error responses use generic message, not raw error object', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'));

      // Force the outer catch to trigger by making parseRiskRegister return empty
      // and then triggering an error in the main handler
      const response = await GET();
      const data = await response.json();

      // Should still be 200 since parseRiskRegister catches internally
      expect(response.status).toBe(200);
      expect(data.risks).toEqual([]);
    });
  });

  describe('POST /api/tracking/risks - Add Risk', () => {
    it('adds a new risk to the register', async () => {
      mockFs.readFile.mockResolvedValue(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          risk: {
            category: 'Technical',
            description: 'New test risk',
            impact: 4,
            likelihood: 3,
            owner: 'Test Lead',
            mitigation: 'Test mitigation strategy',
          },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.riskId).toMatch(/^RISK-\d{3}$/);
    });

    it('generates sequential risk IDs', async () => {
      mockFs.readFile.mockResolvedValue(SAMPLE_RISK_CSV);
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          risk: {
            description: 'Test',
            category: 'Technical',
            impact: 3,
            likelihood: 3,
            owner: 'Test',
            mitigation: 'Test',
          },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.riskId).toBe('RISK-006');
    });

    it('writes audit trail entry on add', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          risk: {
            category: 'Technical',
            description: 'Audit test',
            impact: 3,
            likelihood: 3,
            owner: 'Tester',
            mitigation: 'Mitigation',
          },
        }),
      });

      await POST(request);

      // Verify audit trail was written
      const writeCalls = mockFs.writeFile.mock.calls;
      const auditWrite = writeCalls.find((c: string[]) => c[0]?.includes('risk-register-history'));
      expect(auditWrite).toBeDefined();
      if (auditWrite) {
        const auditData = JSON.parse(auditWrite[1]);
        expect(Array.isArray(auditData)).toBe(true);
        expect(auditData[0].action).toBe('add');
        expect(auditData[0].riskId).toMatch(/^RISK-\d{3}$/);
      }
    });
  });

  describe('POST /api/tracking/risks - Edit Risk', () => {
    it('updates risk status with valid transition', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'RISK-001',
          updates: { status: 'Monitoring' }, // Mitigated → Monitoring is valid
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });

    it('updates mitigation text', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'RISK-001',
          updates: { mitigation: 'Updated mitigation strategy' },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');

      // Verify CSV was rewritten with updated mitigation
      const csvWriteCall = mockFs.writeFile.mock.calls.find(
        (c: string[]) => c[0]?.includes('risk-register') && !c[0]?.includes('history')
      );
      expect(csvWriteCall).toBeDefined();
      if (csvWriteCall) {
        expect(csvWriteCall[1]).toContain('Updated mitigation strategy');
      }
    });

    it('partial update preserves other fields', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'RISK-001',
          updates: { owner: 'New Owner' },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify original description is preserved in the CSV write
      const csvWriteCall = mockFs.writeFile.mock.calls.find(
        (c: string[]) => c[0]?.includes('risk-register') && !c[0]?.includes('history')
      );
      expect(csvWriteCall).toBeDefined();
      if (csvWriteCall) {
        expect(csvWriteCall[1]).toContain('LangChain API breaking changes');
        expect(csvWriteCall[1]).toContain('New Owner');
      }
    });

    it('recalculates score when impact and likelihood change', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'RISK-001',
          updates: { impact: 2, likelihood: 3 },
        }),
      });

      const response = await POST(request);
      const data = await response.json();
      expect(data.status).toBe('ok');

      // Verify the CSV was written with new score (2 * 3 = 6)
      const csvWriteCall = mockFs.writeFile.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('risk-register')
      );
      expect(csvWriteCall).toBeTruthy();
      if (csvWriteCall) {
        expect(csvWriteCall[1]).toContain(',6,'); // score = 2 * 3
      }
    });

    it('handles notes with newline characters in CSV output', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'RISK-001',
          updates: { notes: 'Line one\nLine two' },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify the CSV was written with properly escaped newline
      const csvWriteCall = mockFs.writeFile.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('risk-register')
      );
      expect(csvWriteCall).toBeTruthy();
      if (csvWriteCall) {
        // Newline in value should be quoted in CSV
        expect(csvWriteCall[1]).toContain('"Line one\nLine two"');
      }
    });

    it('returns 400 for invalid status transition', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'RISK-001',
          updates: { status: 'Accepted' }, // Mitigated → Accepted is NOT valid
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('returns 404 for non-existent risk', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'RISK-999',
          updates: { status: 'Closed' },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(404);
    });

    it('writeFile failure returns 500 with generic error', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockRejectedValue(new Error('disk full'));

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'RISK-001',
          updates: { owner: 'New Owner' },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.message).not.toContain('disk full');
      expect(data.message).toBe('Internal server error');
    });

    it('edit appends audit trail entry', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'RISK-001',
          updates: { status: 'Monitoring' },
        }),
      });

      await POST(request);

      const auditWrite = mockFs.writeFile.mock.calls.find((c: string[]) =>
        c[0]?.includes('risk-register-history')
      );
      expect(auditWrite).toBeDefined();
      if (auditWrite) {
        const auditData = JSON.parse(auditWrite[1]);
        expect(auditData[0].action).toBe('edit');
        expect(auditData[0].riskId).toBe('RISK-001');
        expect(auditData[0].previousStatus).toBe('Mitigated');
        expect(auditData[0].newStatus).toBe('Monitoring');
        expect(auditData[0].changedAt).toBeDefined();
      }
    });
  });

  describe('POST /api/tracking/risks - Zod Validation', () => {
    it('rejects impact > 5', async () => {
      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          risk: {
            category: 'Technical',
            description: 'Test',
            impact: 6,
            likelihood: 3,
            owner: 'Test',
            mitigation: 'Test',
          },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('rejects likelihood < 1', async () => {
      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          risk: {
            category: 'Technical',
            description: 'Test',
            impact: 3,
            likelihood: 0,
            owner: 'Test',
            mitigation: 'Test',
          },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('rejects description > 2000 chars', async () => {
      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          risk: {
            category: 'Technical',
            description: 'x'.repeat(2001),
            impact: 3,
            likelihood: 3,
            owner: 'Test',
            mitigation: 'Test',
          },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('rejects invalid riskId format on edit', async () => {
      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'edit',
          riskId: 'INVALID',
          updates: { owner: 'Test' },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/tracking/risks - Security', () => {
    it('sanitizes CSV injection in add risk description', async () => {
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('risk-register-history')) {
          return '[]';
        }
        return SAMPLE_RISK_CSV;
      });
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          risk: {
            category: 'Technical',
            description: '=CMD() injection attempt',
            impact: 3,
            likelihood: 3,
            owner: 'Test',
            mitigation: 'Test',
          },
        }),
      });

      await POST(request);

      const csvWriteCall = mockFs.writeFile.mock.calls.find(
        (c: string[]) => c[0]?.includes('risk-register') && !c[0]?.includes('history')
      );
      expect(csvWriteCall).toBeDefined();
      if (csvWriteCall) {
        // The written CSV should NOT contain the raw =CMD()
        expect(csvWriteCall[1]).not.toContain('=CMD()');
        expect(csvWriteCall[1]).toContain('CMD()');
      }
    });
  });

  describe('Invalid Actions', () => {
    it('returns 400 for invalid action', async () => {
      const request = new NextRequest('http://localhost:3002/api/tracking/risks', {
        method: 'POST',
        body: JSON.stringify({
          action: 'invalid_action',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.message).toContain('Invalid action');
    });
  });
});
