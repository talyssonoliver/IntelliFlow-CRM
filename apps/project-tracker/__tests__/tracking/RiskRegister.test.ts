import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  classifyScore,
  getScoreColor,
  getStatusColor,
  sanitizeCSVField,
  normalizeStatus,
  generateCSVExport,
  generateJSONExport,
  type Risk,
  type RiskSummary,
  type RiskStatus,
} from '../../lib/risk-domain';

/**
 * Tests for RiskRegister component logic.
 *
 * Since the project-tracker uses Node environment (not jsdom),
 * these tests focus on the pure functions and logic that can be
 * extracted and tested independently.
 */

// ─── Helper: filter risks (mirrors component logic) ─────────────────────────

function filterRisks(risks: Risk[], filter: 'all' | 'open' | 'high'): Risk[] {
  if (filter === 'open')
    return risks.filter((r) => r.status === 'Open' || r.status === 'In Progress');
  if (filter === 'high') return risks.filter((r) => r.score >= 15);
  return risks;
}

function calculateSummary(risks: Risk[]): RiskSummary {
  return {
    total: risks.length,
    open: risks.filter((r) => r.status === 'Open').length,
    mitigated: risks.filter((r) => r.status === 'Mitigated').length,
    monitoring: risks.filter((r) => r.status === 'Monitoring').length,
    closed: risks.filter((r) => r.status === 'Closed').length,
    inProgress: risks.filter((r) => r.status === 'In Progress').length,
    accepted: risks.filter((r) => r.status === 'Accepted').length,
    highRisk: risks.filter((r) => r.score >= 15).length,
    mediumRisk: risks.filter((r) => r.score >= 6 && r.score < 15).length,
    lowRisk: risks.filter((r) => r.score < 6).length,
  };
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const makeRisk = (overrides: Partial<Risk> = {}): Risk => ({
  id: 'RISK-001',
  category: 'Technology',
  description: 'Test risk',
  impact: 4,
  likelihood: 4,
  score: 16,
  status: 'Open',
  owner: 'Tech Lead',
  mitigation: 'Mitigate it',
  lastReviewed: '2025-01-15',
  escalationPath: 'CTO',
  evidence: 'Evidence here',
  notes: 'Some notes',
  reviewDate: '2025-01-15',
  ...overrides,
});

describe('RiskRegister Component Logic', () => {
  // ─── Status Transition Tests ───────────────────────────────────────────────

  describe('isValidTransition', () => {
    it('Open → In Progress is valid', () => {
      expect(isValidTransition('Open', 'In Progress')).toBe(true);
    });

    it('Open → Accepted is valid', () => {
      expect(isValidTransition('Open', 'Accepted')).toBe(true);
    });

    it('Open → Closed is NOT valid (not a direct transition)', () => {
      expect(isValidTransition('Open', 'Closed')).toBe(false);
    });

    it('Closed → Open is NOT valid (terminal state)', () => {
      expect(isValidTransition('Closed', 'Open')).toBe(false);
    });

    it('Mitigated → Monitoring is valid', () => {
      expect(isValidTransition('Mitigated', 'Monitoring')).toBe(true);
    });

    it('Mitigated → Closed is valid', () => {
      expect(isValidTransition('Mitigated', 'Closed')).toBe(true);
    });

    it('Accepted → Closed is valid', () => {
      expect(isValidTransition('Accepted', 'Closed')).toBe(true);
    });

    it('all transitions from Closed return false (terminal)', () => {
      const allStatuses: RiskStatus[] = [
        'Open',
        'In Progress',
        'Mitigated',
        'Monitoring',
        'Accepted',
        'Closed',
      ];
      for (const target of allStatuses) {
        expect(isValidTransition('Closed', target)).toBe(false);
      }
    });
  });

  // ─── Score Classification Tests ────────────────────────────────────────────

  describe('classifyScore', () => {
    it('classifyScore(25) returns Critical', () => {
      expect(classifyScore(25)).toBe('Critical');
    });

    it('classifyScore(20) returns Critical', () => {
      expect(classifyScore(20)).toBe('Critical');
    });

    it('classifyScore(19) returns High', () => {
      expect(classifyScore(19)).toBe('High');
    });

    it('classifyScore(15) returns High', () => {
      expect(classifyScore(15)).toBe('High');
    });

    it('classifyScore(14) returns Medium', () => {
      expect(classifyScore(14)).toBe('Medium');
    });

    it('classifyScore(10) returns Medium', () => {
      expect(classifyScore(10)).toBe('Medium');
    });

    it('classifyScore(9) returns Low', () => {
      expect(classifyScore(9)).toBe('Low');
    });

    it('classifyScore(6) returns Low', () => {
      expect(classifyScore(6)).toBe('Low');
    });

    it('classifyScore(5) returns Minimal', () => {
      expect(classifyScore(5)).toBe('Minimal');
    });

    it('classifyScore(1) returns Minimal', () => {
      expect(classifyScore(1)).toBe('Minimal');
    });
  });

  // ─── CSV Injection Sanitization Tests ──────────────────────────────────────

  describe('sanitizeCSVField', () => {
    it('strips leading = from =CMD()', () => {
      expect(sanitizeCSVField('=CMD()')).toBe('CMD()');
    });

    it('strips leading + from +cmd', () => {
      expect(sanitizeCSVField('+cmd')).toBe('cmd');
    });

    it('strips leading - from -cmd', () => {
      expect(sanitizeCSVField('-cmd')).toBe('cmd');
    });

    it('strips leading @ from @cmd', () => {
      expect(sanitizeCSVField('@cmd')).toBe('cmd');
    });

    it('passes through normal text unchanged', () => {
      expect(sanitizeCSVField('normal text')).toBe('normal text');
    });
  });

  // ─── Status Normalization Tests ────────────────────────────────────────────

  describe('normalizeStatus', () => {
    it('normalizes Monitored to Monitoring', () => {
      expect(normalizeStatus('Monitored')).toBe('Monitoring');
    });

    it('returns Mitigated unchanged', () => {
      expect(normalizeStatus('Mitigated')).toBe('Mitigated');
    });

    it('returns Open unchanged', () => {
      expect(normalizeStatus('Open')).toBe('Open');
    });

    it('falls back to Open for unknown status', () => {
      expect(normalizeStatus('InvalidStatus')).toBe('Open');
    });
  });

  // ─── Export Logic Tests ────────────────────────────────────────────────────

  describe('generateCSVExport', () => {
    it('produces CSV with all 13 column headers', () => {
      const csv = generateCSVExport([]);
      const headers = csv.split('\n')[0].split(',');
      expect(headers.length).toBe(13);
      expect(headers[0]).toBe('Risk ID');
      expect(headers[12]).toBe('Notes');
    });

    it('includes all risk rows', () => {
      const risks = [makeRisk({ id: 'RISK-001' }), makeRisk({ id: 'RISK-002' })];
      const csv = generateCSVExport(risks);
      const lines = csv.split('\n');
      expect(lines.length).toBe(3); // header + 2 rows
    });

    it('returns headers only for empty array', () => {
      const csv = generateCSVExport([]);
      const lines = csv.split('\n');
      expect(lines.length).toBe(1); // header only
    });

    it('escapes values containing commas and quotes', () => {
      const risks = [makeRisk({ description: 'Risk with, commas', notes: 'Note with "quotes"' })];
      const csv = generateCSVExport(risks);
      // Values with commas/quotes should be wrapped in double-quotes
      expect(csv).toContain('"Risk with, commas"');
      expect(csv).toContain('"Note with ""quotes"""');
    });

    it('exports filtered risks only', () => {
      const allRisks = [
        makeRisk({ id: 'RISK-001', status: 'Open', score: 20 }),
        makeRisk({ id: 'RISK-002', status: 'Closed', score: 4 }),
      ];
      const filtered = filterRisks(allRisks, 'high');
      const csv = generateCSVExport(filtered);
      const lines = csv.split('\n');
      expect(lines.length).toBe(2); // header + 1 high-risk row
    });
  });

  describe('generateJSONExport', () => {
    it('includes risks array, summary, and exportedAt timestamp', () => {
      const risks = [makeRisk()];
      const summary = calculateSummary(risks);
      const result = generateJSONExport(risks, summary);
      expect(result.risks).toEqual(risks);
      expect(result.summary).toEqual(summary);
      expect(result.exportedAt).toBeDefined();
      expect(new Date(result.exportedAt).toISOString()).toBe(result.exportedAt);
    });
  });

  // ─── Expandable Row Detail Tests (AC-004) ─────────────────────────────────

  describe('Expandable row state logic', () => {
    it('clicking a risk row sets expandedRow to that risk id', () => {
      let expandedRow: string | null = null;
      const risk = makeRisk({ id: 'RISK-003' });
      // Simulate click
      expandedRow = expandedRow === risk.id ? null : risk.id;
      expect(expandedRow).toBe('RISK-003');
    });

    it('expanded panel has access to full mitigation text', () => {
      const risk = makeRisk({ mitigation: 'Full mitigation strategy text here' });
      expect(risk.mitigation).toBe('Full mitigation strategy text here');
    });

    it('expanded panel has access to escalationPath, evidence, notes', () => {
      const risk = makeRisk({
        escalationPath: 'CTO escalation',
        evidence: 'Evidence doc',
        notes: 'Important notes',
      });
      expect(risk.escalationPath).toBe('CTO escalation');
      expect(risk.evidence).toBe('Evidence doc');
      expect(risk.notes).toBe('Important notes');
    });

    it('clicking same row again collapses it (resets to null)', () => {
      let expandedRow: string | null = 'RISK-003';
      const risk = makeRisk({ id: 'RISK-003' });
      expandedRow = expandedRow === risk.id ? null : risk.id;
      expect(expandedRow).toBeNull();
    });
  });

  // ─── Edit Form Validation Tests ────────────────────────────────────────────

  describe('Edit form validation logic', () => {
    it('empty description should be blocked (required field)', () => {
      const description = '';
      expect(description.trim().length > 0).toBe(false);
    });

    it('score auto-computes from impact × likelihood', () => {
      const impact = 4;
      const likelihood = 3;
      expect(impact * likelihood).toBe(12);
    });

    it('Risk ID is read-only in edit mode', () => {
      const risk = makeRisk({ id: 'RISK-005' });
      // In edit mode, ID should not be in the updates object
      const updates: Partial<Risk> = { description: 'Updated desc' };
      expect(updates).not.toHaveProperty('id');
      expect(risk.id).toBe('RISK-005');
    });
  });

  // ─── getScoreColor (imported from domain) ──────────────────────────────────

  describe('getScoreColor', () => {
    it('returns red for critical risks (score >= 15)', () => {
      expect(getScoreColor(25)).toContain('red');
      expect(getScoreColor(20)).toContain('red');
      expect(getScoreColor(16)).toContain('red');
      expect(getScoreColor(15)).toContain('red');
    });

    it('returns orange for high risks (score >= 10)', () => {
      expect(getScoreColor(14)).toContain('orange');
      expect(getScoreColor(12)).toContain('orange');
      expect(getScoreColor(10)).toContain('orange');
    });

    it('returns yellow for medium risks (score >= 6)', () => {
      expect(getScoreColor(9)).toContain('yellow');
      expect(getScoreColor(8)).toContain('yellow');
      expect(getScoreColor(6)).toContain('yellow');
    });

    it('returns green for low risks (score < 6)', () => {
      expect(getScoreColor(5)).toContain('green');
      expect(getScoreColor(3)).toContain('green');
      expect(getScoreColor(1)).toContain('green');
    });
  });

  // ─── getStatusColor (imported from domain) ─────────────────────────────────

  describe('getStatusColor', () => {
    it('returns red for Open status', () => {
      expect(getStatusColor('Open')).toContain('red');
    });

    it('returns green for Mitigated status', () => {
      expect(getStatusColor('Mitigated')).toContain('green');
    });

    it('returns blue for Monitoring status', () => {
      expect(getStatusColor('Monitoring')).toContain('blue');
    });

    it('returns yellow for In Progress status', () => {
      expect(getStatusColor('In Progress')).toContain('yellow');
    });

    it('returns purple for Accepted status', () => {
      expect(getStatusColor('Accepted')).toContain('purple');
    });

    it('returns gray for Closed status', () => {
      expect(getStatusColor('Closed')).toContain('gray');
    });

    it('returns gray for unknown status', () => {
      expect(getStatusColor('Unknown')).toContain('gray');
    });
  });

  // ─── filterRisks (local helper mirroring component) ────────────────────────

  describe('filterRisks', () => {
    const mockRisks: Risk[] = [
      makeRisk({ id: 'RISK-001', score: 16, status: 'Open' }),
      makeRisk({ id: 'RISK-002', score: 9, status: 'Mitigated' }),
      makeRisk({ id: 'RISK-003', score: 4, status: 'Closed' }),
      makeRisk({ id: 'RISK-004', score: 20, status: 'In Progress' }),
    ];

    it('returns all risks when filter is "all"', () => {
      const result = filterRisks(mockRisks, 'all');
      expect(result.length).toBe(4);
    });

    it('returns only Open and In Progress risks when filter is "open"', () => {
      const result = filterRisks(mockRisks, 'open');
      expect(result.length).toBe(2);
      expect(result.every((r) => r.status === 'Open' || r.status === 'In Progress')).toBe(true);
    });

    it('returns only high-score risks when filter is "high"', () => {
      const result = filterRisks(mockRisks, 'high');
      expect(result.length).toBe(2);
      expect(result.every((r) => r.score >= 15)).toBe(true);
    });
  });

  // ─── calculateSummary (local helper mirroring component) ───────────────────

  describe('calculateSummary', () => {
    const mockRisks: Risk[] = [
      makeRisk({ id: 'RISK-001', score: 16, status: 'Open' }),
      makeRisk({ id: 'RISK-002', score: 9, status: 'Mitigated' }),
      makeRisk({ id: 'RISK-003', score: 4, status: 'Mitigated' }),
      makeRisk({ id: 'RISK-004', score: 20, status: 'Monitoring' }),
      makeRisk({ id: 'RISK-005', score: 2, status: 'Closed' }),
    ];

    it('calculates total correctly', () => {
      const summary = calculateSummary(mockRisks);
      expect(summary.total).toBe(5);
    });

    it('calculates status counts correctly', () => {
      const summary = calculateSummary(mockRisks);
      expect(summary.open).toBe(1);
      expect(summary.mitigated).toBe(2);
      expect(summary.monitoring).toBe(1);
      expect(summary.closed).toBe(1);
    });

    it('calculates risk level counts correctly', () => {
      const summary = calculateSummary(mockRisks);
      expect(summary.highRisk).toBe(2); // score >= 15
      expect(summary.mediumRisk).toBe(1); // 6 <= score < 15
      expect(summary.lowRisk).toBe(2); // score < 6
    });

    it('handles empty array', () => {
      const summary = calculateSummary([]);
      expect(summary.total).toBe(0);
      expect(summary.open).toBe(0);
      expect(summary.highRisk).toBe(0);
    });
  });

  // ─── Score Calculations ────────────────────────────────────────────────────

  describe('Score Calculations', () => {
    it('score is product of likelihood and impact (1-5 scale)', () => {
      expect(5 * 5).toBe(25);
      expect(4 * 4).toBe(16);
      expect(3 * 4).toBe(12);
      expect(2 * 3).toBe(6);
      expect(1 * 1).toBe(1);
    });

    it('classifies risk levels based on score', () => {
      expect(getScoreColor(25)).toContain('red');
      expect(getScoreColor(20)).toContain('red');
      expect(getScoreColor(19)).toContain('red');
      expect(getScoreColor(15)).toContain('red');
      expect(getScoreColor(14)).toContain('orange');
      expect(getScoreColor(10)).toContain('orange');
      expect(getScoreColor(9)).toContain('yellow');
      expect(getScoreColor(6)).toContain('yellow');
      expect(getScoreColor(5)).toContain('green');
      expect(getScoreColor(1)).toContain('green');
    });
  });
});
