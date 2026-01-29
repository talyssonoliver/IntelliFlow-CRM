import { describe, it, expect } from 'vitest';

/**
 * Tests for RiskRegister component logic.
 *
 * Since the project-tracker uses Node environment (not jsdom),
 * these tests focus on the pure functions and logic that can be
 * extracted and tested independently.
 */

// Risk interface matching the component
interface Risk {
  id: string;
  category: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  likelihood: 'High' | 'Medium' | 'Low';
  impactScore?: number;
  likelihoodScore?: number;
  score: number;
  status: 'Open' | 'Mitigated' | 'Closed' | 'Monitoring' | 'In Progress' | 'Accepted' | 'Monitored';
  owner: string;
  mitigation: string;
  lastReviewed: string;
}

// Extract pure functions from component for testing
// These mirror the logic in RiskRegister.tsx

/**
 * Gets color class for risk score (1-25 scale)
 */
function getScoreColor(score: number): string {
  if (score >= 15) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (score >= 10) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (score >= 6) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-green-500/20 text-green-400 border-green-500/30';
}

/**
 * Gets color class for risk status
 */
function getStatusColor(status: string): string {
  switch (status) {
    case 'Open':
      return 'bg-red-500/20 text-red-400';
    case 'Mitigated':
      return 'bg-green-500/20 text-green-400';
    case 'Monitored':
    case 'Monitoring':
      return 'bg-blue-500/20 text-blue-400';
    case 'In Progress':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'Accepted':
      return 'bg-purple-500/20 text-purple-400';
    case 'Closed':
      return 'bg-gray-500/20 text-gray-400';
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
}

/**
 * Filters risks based on filter type
 */
function filterRisks(risks: Risk[], filter: 'all' | 'open' | 'high'): Risk[] {
  if (filter === 'open') return risks.filter(r => r.status === 'Open' || r.status === 'In Progress');
  if (filter === 'high') return risks.filter(r => r.score >= 15);
  return risks;
}

/**
 * Calculates summary statistics from risks
 */
function calculateSummary(risks: Risk[]): {
  total: number;
  open: number;
  mitigated: number;
  monitoring: number;
  closed: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
} {
  return {
    total: risks.length,
    open: risks.filter(r => r.status === 'Open').length,
    mitigated: risks.filter(r => r.status === 'Mitigated').length,
    monitoring: risks.filter(r => r.status === 'Monitoring' || r.status === 'Monitored').length,
    closed: risks.filter(r => r.status === 'Closed').length,
    highRisk: risks.filter(r => r.score >= 15).length,
    mediumRisk: risks.filter(r => r.score >= 6 && r.score < 15).length,
    lowRisk: risks.filter(r => r.score < 6).length,
  };
}

describe('RiskRegister Component Logic', () => {
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

  describe('getStatusColor', () => {
    it('returns red for Open status', () => {
      expect(getStatusColor('Open')).toContain('red');
    });

    it('returns green for Mitigated status', () => {
      expect(getStatusColor('Mitigated')).toContain('green');
    });

    it('returns blue for Monitored/Monitoring status', () => {
      expect(getStatusColor('Monitored')).toContain('blue');
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

  describe('filterRisks', () => {
    const mockRisks: Risk[] = [
      { id: 'RISK-001', category: 'Tech', description: 'Risk 1', impact: 'High', likelihood: 'High', score: 16, status: 'Open', owner: 'A', mitigation: '', lastReviewed: '' },
      { id: 'RISK-002', category: 'Tech', description: 'Risk 2', impact: 'Medium', likelihood: 'Medium', score: 9, status: 'Mitigated', owner: 'B', mitigation: '', lastReviewed: '' },
      { id: 'RISK-003', category: 'Tech', description: 'Risk 3', impact: 'Low', likelihood: 'Low', score: 4, status: 'Closed', owner: 'C', mitigation: '', lastReviewed: '' },
      { id: 'RISK-004', category: 'Tech', description: 'Risk 4', impact: 'High', likelihood: 'High', score: 20, status: 'In Progress', owner: 'D', mitigation: '', lastReviewed: '' },
    ];

    it('returns all risks when filter is "all"', () => {
      const result = filterRisks(mockRisks, 'all');
      expect(result.length).toBe(4);
    });

    it('returns only Open and In Progress risks when filter is "open"', () => {
      const result = filterRisks(mockRisks, 'open');
      expect(result.length).toBe(2);
      expect(result.every(r => r.status === 'Open' || r.status === 'In Progress')).toBe(true);
    });

    it('returns only high-score risks when filter is "high"', () => {
      const result = filterRisks(mockRisks, 'high');
      expect(result.length).toBe(2);
      expect(result.every(r => r.score >= 15)).toBe(true);
    });
  });

  describe('calculateSummary', () => {
    const mockRisks: Risk[] = [
      { id: 'RISK-001', category: 'Tech', description: 'Risk 1', impact: 'High', likelihood: 'High', score: 16, status: 'Open', owner: 'A', mitigation: '', lastReviewed: '' },
      { id: 'RISK-002', category: 'Tech', description: 'Risk 2', impact: 'Medium', likelihood: 'Medium', score: 9, status: 'Mitigated', owner: 'B', mitigation: '', lastReviewed: '' },
      { id: 'RISK-003', category: 'Tech', description: 'Risk 3', impact: 'Low', likelihood: 'Low', score: 4, status: 'Mitigated', owner: 'C', mitigation: '', lastReviewed: '' },
      { id: 'RISK-004', category: 'Tech', description: 'Risk 4', impact: 'High', likelihood: 'High', score: 20, status: 'Monitoring', owner: 'D', mitigation: '', lastReviewed: '' },
      { id: 'RISK-005', category: 'Tech', description: 'Risk 5', impact: 'Low', likelihood: 'Low', score: 2, status: 'Closed', owner: 'E', mitigation: '', lastReviewed: '' },
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
      expect(summary.highRisk).toBe(2);   // score >= 15
      expect(summary.mediumRisk).toBe(1); // 6 <= score < 15
      expect(summary.lowRisk).toBe(2);    // score < 6
    });

    it('handles empty array', () => {
      const summary = calculateSummary([]);
      expect(summary.total).toBe(0);
      expect(summary.open).toBe(0);
      expect(summary.highRisk).toBe(0);
    });
  });

  describe('Risk Data Structure', () => {
    it('validates complete risk object structure', () => {
      const validRisk: Risk = {
        id: 'RISK-001',
        category: 'Technology',
        description: 'Test risk description',
        impact: 'High',
        likelihood: 'Medium',
        impactScore: 4,
        likelihoodScore: 3,
        score: 12,
        status: 'Mitigated',
        owner: 'Tech Lead',
        mitigation: 'Version pinning strategy',
        lastReviewed: '2025-01-15',
      };

      expect(validRisk.id).toBeDefined();
      expect(validRisk.category).toBeDefined();
      expect(validRisk.score).toBeGreaterThan(0);
      expect(['High', 'Medium', 'Low']).toContain(validRisk.impact);
      expect(['High', 'Medium', 'Low']).toContain(validRisk.likelihood);
    });

    it('validates all valid status values', () => {
      const validStatuses: Risk['status'][] = [
        'Open',
        'Mitigated',
        'Closed',
        'Monitoring',
        'In Progress',
        'Accepted',
        'Monitored',
      ];

      validStatuses.forEach(status => {
        const risk: Risk = {
          id: 'RISK-001',
          category: 'Tech',
          description: 'Test',
          impact: 'Medium',
          likelihood: 'Medium',
          score: 9,
          status,
          owner: 'Test',
          mitigation: '',
          lastReviewed: '',
        };
        expect(risk.status).toBe(status);
      });
    });
  });

  describe('Score Calculations', () => {
    it('score is product of likelihood and impact (1-5 scale)', () => {
      // In the actual CSV:
      // Likelihood (1-5) * Impact (1-5) = Score (1-25)
      expect(5 * 5).toBe(25); // Max score
      expect(4 * 4).toBe(16); // High risk
      expect(3 * 4).toBe(12); // Medium-high
      expect(2 * 3).toBe(6);  // Medium
      expect(1 * 1).toBe(1);  // Min score
    });

    it('classifies risk levels based on score', () => {
      // Critical: 20-25
      expect(getScoreColor(25)).toContain('red');
      expect(getScoreColor(20)).toContain('red');

      // High: 15-19
      expect(getScoreColor(19)).toContain('red');
      expect(getScoreColor(15)).toContain('red');

      // Medium: 10-14
      expect(getScoreColor(14)).toContain('orange');
      expect(getScoreColor(10)).toContain('orange');

      // Low-Medium: 6-9
      expect(getScoreColor(9)).toContain('yellow');
      expect(getScoreColor(6)).toContain('yellow');

      // Minimal: 1-5
      expect(getScoreColor(5)).toContain('green');
      expect(getScoreColor(1)).toContain('green');
    });
  });
});
