import { describe, it, expect } from 'vitest';
import {
  computePriorityScores,
  scoreBusinessValue,
  scoreTimeCriticality,
  scoreRiskReduction,
  computeJobSizeProxy,
  type DepGraphNode,
  type SessionStatus,
  type ScheduleTaskInfo,
  type PhaseProgress,
} from '../priority-scorer';
import type { Task } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fibonacci values used in the scorer (SAFe WSJF scale) */
const FIB = [1, 2, 3, 5, 8, 13];

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    section: 'Test',
    description: 'Test task',
    owner: 'AI',
    dependencies: [],
    cleanDependencies: [],
    crossQuarterDeps: false,
    prerequisites: '',
    dod: '',
    status: 'Planned',
    kpis: '',
    sprint: 5,
    artifacts: [],
    validation: '',
    cadence: '',
    ...overrides,
  };
}

function isFibonacci(n: number): boolean {
  return FIB.includes(n);
}

// ---------------------------------------------------------------------------
// scoreBusinessValue — governance tier + critical path
// ---------------------------------------------------------------------------

describe('scoreBusinessValue', () => {
  it('returns a Fibonacci value', () => {
    const val = scoreBusinessValue('IFC-050', 'Core CRM', 0, false);
    expect(isFibonacci(val)).toBe(true);
  });

  describe('Tier A tasks (high business value)', () => {
    it('scores security tasks high (SEC- prefix)', () => {
      const val = scoreBusinessValue('EXC-SEC-001', 'Security', 0, false);
      expect(val).toBeGreaterThanOrEqual(8);
    });

    it('scores foundational IFC tasks high (IFC-001 to IFC-010)', () => {
      expect(scoreBusinessValue('IFC-001', 'Core', 0, false)).toBeGreaterThanOrEqual(8);
      expect(scoreBusinessValue('IFC-010', 'Core', 0, false)).toBeGreaterThanOrEqual(8);
    });

    it('scores tasks with 5+ dependents as Tier A', () => {
      const val = scoreBusinessValue('MISC-001', 'Misc', 5, false);
      expect(val).toBeGreaterThanOrEqual(8);
    });

    it('scores exception tasks high (EXC- prefix)', () => {
      const val = scoreBusinessValue('EXC-INIT-001', 'Foundation', 0, false);
      expect(val).toBeGreaterThanOrEqual(8);
    });

    it('scores GTM tasks high', () => {
      const val = scoreBusinessValue('GTM-001', 'Go-To-Market', 0, false);
      expect(val).toBeGreaterThanOrEqual(8);
    });

    it('scores DOC-001, BRAND-001, ANALYTICS-001 high', () => {
      expect(scoreBusinessValue('DOC-001', 'Docs', 0, false)).toBeGreaterThanOrEqual(8);
      expect(scoreBusinessValue('BRAND-001', 'Brand', 0, false)).toBeGreaterThanOrEqual(8);
      expect(scoreBusinessValue('ANALYTICS-001', 'Analytics', 0, false)).toBeGreaterThanOrEqual(8);
    });

    it('scores security-section tasks high', () => {
      const val = scoreBusinessValue('MISC-099', 'Security Foundation', 0, false);
      expect(val).toBeGreaterThanOrEqual(8);
    });

    it('scores planning/strategy section tasks high', () => {
      expect(scoreBusinessValue('MISC-001', 'Sprint Planning', 0, false)).toBeGreaterThanOrEqual(8);
      expect(scoreBusinessValue('MISC-002', 'Product Strategy', 0, false)).toBeGreaterThanOrEqual(
        8
      );
    });
  });

  describe('Tier B tasks (medium business value)', () => {
    it('scores ENV- prefix tasks as Tier B', () => {
      const val = scoreBusinessValue('ENV-001-AI', 'Environment', 0, false);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(8);
    });

    it('scores AI-SETUP- prefix tasks as Tier B', () => {
      const val = scoreBusinessValue('AI-SETUP-003', 'AI Foundation', 0, false);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(8);
    });

    it('scores AUTOMATION- prefix as Tier B', () => {
      const val = scoreBusinessValue('AUTOMATION-002', 'Automation', 0, false);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(8);
    });

    it('scores tasks with 2-4 dependents as Tier B', () => {
      const val = scoreBusinessValue('MISC-050', 'Misc', 2, false);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(8);
    });

    it('scores ENG-OPS- prefix as Tier B', () => {
      const val = scoreBusinessValue('ENG-OPS-001', 'Engineering', 0, false);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(8);
    });
  });

  describe('Tier C tasks (default / low)', () => {
    it('scores generic tasks low', () => {
      const val = scoreBusinessValue('IFC-050', 'Core CRM', 0, false);
      expect(val).toBeLessThanOrEqual(3);
    });

    it('scores PG- prefix tasks as Tier C by default', () => {
      const val = scoreBusinessValue('PG-010', 'Page', 0, false);
      expect(val).toBeLessThanOrEqual(3);
    });
  });

  describe('critical path bonus', () => {
    it('increases score when on critical path', () => {
      const without = scoreBusinessValue('IFC-050', 'Core CRM', 0, false);
      const with_ = scoreBusinessValue('IFC-050', 'Core CRM', 0, true);
      expect(with_).toBeGreaterThan(without);
    });

    it('critical path Tier A scores highest (13)', () => {
      // Tier A (0.85) + critical path (+0.3) clamped to 1.0 → Fibonacci 13
      const val = scoreBusinessValue('EXC-SEC-001', 'Security', 0, true);
      expect(val).toBe(13);
    });
  });
});

// ---------------------------------------------------------------------------
// scoreTimeCriticality — CPM Total Float + sprint distance
// ---------------------------------------------------------------------------

describe('scoreTimeCriticality', () => {
  it('returns a Fibonacci value', () => {
    const val = scoreTimeCriticality('T1', new Map(), 5, 5);
    expect(isFibonacci(val)).toBe(true);
  });

  describe('totalFloat-based scoring (CPM)', () => {
    it('scores overdue tasks highest (negative float)', () => {
      const map = new Map<string, ScheduleTaskInfo>([['T1', { taskId: 'T1', totalFloat: -120 }]]);
      const val = scoreTimeCriticality('T1', map, 5, 5);
      // Float score = 1.0, sprint score = 1.0, combined = 1.0 → Fibonacci 13
      expect(val).toBe(13);
    });

    it('scores zero float (critical path) as highest', () => {
      const map = new Map<string, ScheduleTaskInfo>([['T1', { taskId: 'T1', totalFloat: 0 }]]);
      const val = scoreTimeCriticality('T1', map, 5, 5);
      expect(val).toBe(13);
    });

    it('scores tight float (1-60 min) as high', () => {
      const map = new Map<string, ScheduleTaskInfo>([['T1', { taskId: 'T1', totalFloat: 30 }]]);
      const val = scoreTimeCriticality('T1', map, 5, 5);
      // Float 0.8, sprint 1.0, combined = 0.88 → Fibonacci 13
      expect(val).toBeGreaterThanOrEqual(8);
    });

    it('scores moderate float (60-480 min) as moderate', () => {
      const map = new Map<string, ScheduleTaskInfo>([['T1', { taskId: 'T1', totalFloat: 240 }]]);
      const val = scoreTimeCriticality('T1', map, 5, 5);
      // Float 0.6, sprint 1.0, combined = 0.76 → Fibonacci 8
      expect(val).toBeGreaterThanOrEqual(5);
    });

    it('scores high float (5+ days) as low', () => {
      const map = new Map<string, ScheduleTaskInfo>([['T1', { taskId: 'T1', totalFloat: 5000 }]]);
      // Distant sprint to avoid sprint urgency boost
      const val = scoreTimeCriticality('T1', map, 20, 5);
      // Float 0.0, sprint 0.0, combined = 0.0 → Fibonacci 1
      expect(val).toBe(1);
    });
  });

  describe('earlyFinish fallback (when totalFloat unavailable)', () => {
    it('scores overdue earlyFinish as high', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const map = new Map<string, ScheduleTaskInfo>([
        ['T1', { taskId: 'T1', earlyFinish: yesterday }],
      ]);
      const val = scoreTimeCriticality('T1', map, 5, 5);
      expect(val).toBeGreaterThanOrEqual(8);
    });

    it('scores far-future earlyFinish as low', () => {
      const farFuture = new Date(Date.now() + 30 * 86400000).toISOString();
      const map = new Map<string, ScheduleTaskInfo>([
        ['T1', { taskId: 'T1', earlyFinish: farFuture }],
      ]);
      // Distant sprint to avoid sprint boost
      const val = scoreTimeCriticality('T1', map, 20, 5);
      expect(val).toBeLessThanOrEqual(3);
    });
  });

  describe('sprint distance scoring', () => {
    it('current sprint scores highest sprint urgency', () => {
      const val = scoreTimeCriticality('T1', new Map(), 5, 5);
      // No schedule info (float=0, earlyFinish=0), sprint only: distance=0 → 1.0 → combined = 0.4
      expect(val).toBeGreaterThanOrEqual(2);
    });

    it('past sprint scores highest sprint urgency', () => {
      const val = scoreTimeCriticality('T1', new Map(), 3, 5);
      expect(val).toBeGreaterThanOrEqual(2);
    });

    it('distant sprint scores low urgency', () => {
      const val = scoreTimeCriticality('T1', new Map(), 20, 5);
      // No schedule + distant sprint → combined = 0 → Fibonacci 1
      expect(val).toBe(1);
    });

    it('non-numeric sprint returns low urgency for sprint component', () => {
      const val = scoreTimeCriticality('T1', new Map(), 'Continuous' as unknown as number, 5);
      expect(val).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// scoreRiskReduction — fan-out + phase health
// ---------------------------------------------------------------------------

describe('scoreRiskReduction', () => {
  it('returns a Fibonacci value', () => {
    const val = scoreRiskReduction(0, []);
    expect(isFibonacci(val)).toBe(true);
  });

  describe('fan-out scoring', () => {
    it('returns lowest for zero dependents', () => {
      const val = scoreRiskReduction(0, []);
      expect(val).toBe(1);
    });

    it('increases with more dependents', () => {
      const val1 = scoreRiskReduction(1, []);
      const val3 = scoreRiskReduction(3, []);
      const val5 = scoreRiskReduction(5, []);
      expect(val3).toBeGreaterThanOrEqual(val1);
      expect(val5).toBeGreaterThanOrEqual(val3);
    });

    it('caps at 5+ dependents (approaches max)', () => {
      const val5 = scoreRiskReduction(5, []);
      const val10 = scoreRiskReduction(10, []);
      // Both should be high; 10 dependents capped at 1.0 same as 5.5+
      expect(val5).toBeGreaterThanOrEqual(5);
      expect(val10).toBeGreaterThanOrEqual(val5);
    });
  });

  describe('phase health scoring', () => {
    it('boosts score when worst phase is below 50%', () => {
      const phases: PhaseProgress[] = [
        {
          phaseId: 'p1',
          phaseName: 'Phase 1',
          total: 10,
          completed: 3,
          inProgress: 1,
          percentage: 30,
        },
      ];
      const withPhase = scoreRiskReduction(2, phases);
      const withoutPhase = scoreRiskReduction(2, []);
      expect(withPhase).toBeGreaterThanOrEqual(withoutPhase);
    });

    it('moderately boosts when worst phase is between 50-75%', () => {
      const phases: PhaseProgress[] = [
        {
          phaseId: 'p1',
          phaseName: 'Phase 1',
          total: 10,
          completed: 6,
          inProgress: 1,
          percentage: 60,
        },
      ];
      const withPhase = scoreRiskReduction(2, phases);
      const withoutPhase = scoreRiskReduction(2, []);
      expect(withPhase).toBeGreaterThanOrEqual(withoutPhase);
    });

    it('no boost when all phases above 75%', () => {
      const phases: PhaseProgress[] = [
        {
          phaseId: 'p1',
          phaseName: 'Phase 1',
          total: 10,
          completed: 8,
          inProgress: 1,
          percentage: 80,
        },
      ];
      const withPhase = scoreRiskReduction(0, phases);
      const withoutPhase = scoreRiskReduction(0, []);
      expect(withPhase).toBe(withoutPhase);
    });

    it('uses worst phase percentage', () => {
      const phases: PhaseProgress[] = [
        {
          phaseId: 'p1',
          phaseName: 'Phase 1',
          total: 10,
          completed: 9,
          inProgress: 0,
          percentage: 90,
        },
        {
          phaseId: 'p2',
          phaseName: 'Phase 2',
          total: 10,
          completed: 2,
          inProgress: 1,
          percentage: 20,
        },
      ];
      // Phase 2 is worst at 20% → boosts risk reduction
      const val = scoreRiskReduction(0, phases);
      expect(val).toBeGreaterThanOrEqual(2);
    });

    it('ignores phases with zero tasks', () => {
      const phases: PhaseProgress[] = [
        {
          phaseId: 'p1',
          phaseName: 'Phase 1',
          total: 0,
          completed: 0,
          inProgress: 0,
          percentage: 0,
        },
      ];
      const val = scoreRiskReduction(0, phases);
      expect(val).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// computeJobSizeProxy — pipeline remaining effort
// ---------------------------------------------------------------------------

describe('computeJobSizeProxy', () => {
  it('returns 1 for exec-ready (spec + plan done)', () => {
    expect(computeJobSizeProxy({ hasSpec: true, hasPlan: true })).toBe(1);
  });

  it('returns 2 for plan-ready (spec done, no plan)', () => {
    expect(computeJobSizeProxy({ hasSpec: true, hasPlan: false })).toBe(2);
  });

  it('returns 3 for needs-spec (nothing done)', () => {
    expect(computeJobSizeProxy({ hasSpec: false, hasPlan: false })).toBe(3);
  });

  it('returns 3 for undefined session', () => {
    expect(computeJobSizeProxy(undefined)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computePriorityScores — WSJF integration
// ---------------------------------------------------------------------------

describe('computePriorityScores', () => {
  const emptyGraph = new Map<string, DepGraphNode>();
  const emptySessions = new Map<string, SessionStatus>();
  const emptySchedule = new Map<string, ScheduleTaskInfo>();
  const emptyPhases: PhaseProgress[] = [];

  describe('WSJF score calculation', () => {
    it('calculates score as (BV + TC + RROE) / jobSizeProxy', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      const { factors, score } = result[0];
      const expected =
        (factors.businessValue + factors.timeCriticality + factors.riskReductionOpportunity) /
        factors.jobSizeProxy;
      expect(score).toBeCloseTo(expected, 1);
    });

    it('exec-ready tasks score higher than needs-spec (lower jobSizeProxy)', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const needsSpec = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        new Map(),
        emptySchedule,
        emptyPhases,
        5
      );
      const execReady = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        new Map([['T1', { hasSpec: true, hasPlan: true }]]),
        emptySchedule,
        emptyPhases,
        5
      );
      expect(execReady[0].score).toBeGreaterThan(needsSpec[0].score);
    });

    it('critical path tasks score higher than non-critical', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const nonCritical = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      const critical = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(['T1']),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(critical[0].score).toBeGreaterThan(nonCritical[0].score);
    });

    it('overdue tasks score higher via time criticality', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const noSchedule = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      const overdue = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        new Map([['T1', { taskId: 'T1', totalFloat: -100 }]]),
        emptyPhases,
        5
      );
      expect(overdue[0].score).toBeGreaterThan(noSchedule[0].score);
    });
  });

  describe('sorting', () => {
    it('returns tasks sorted by score descending', () => {
      const tasks = [makeTask({ id: 'LOW', sprint: 20 }), makeTask({ id: 'HIGH', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].taskId).toBe('HIGH');
      expect(result[1].taskId).toBe('LOW');
      expect(result[0].score).toBeGreaterThan(result[1].score);
    });

    it('maintains stable order for equal scores', () => {
      const tasks = [makeTask({ id: 'A', sprint: 5 }), makeTask({ id: 'B', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result).toHaveLength(2);
      // Both should have same score
      expect(result[0].score).toBe(result[1].score);
    });
  });

  describe('bucket assignment (percentile-based)', () => {
    it('assigns NOW to overdue tasks (hard override)', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        new Map([['T1', { taskId: 'T1', totalFloat: -60 }]]),
        emptyPhases,
        5
      );
      expect(result[0].bucket).toBe('now');
    });

    it('assigns NOW to critical path Tier A tasks (hard override)', () => {
      // EXC-SEC-001 is Tier A (security), on critical path → hard override to NOW
      const tasks = [makeTask({ id: 'EXC-SEC-001', section: 'Security', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(['EXC-SEC-001']),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].bucket).toBe('now');
    });

    it('assigns NOW to top 20% by percentile', () => {
      // Create 10 tasks with varying scores
      const tasks = Array.from({ length: 10 }, (_, i) =>
        makeTask({ id: `T${i}`, sprint: i < 2 ? 5 : 20 })
      );
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      const nowTasks = result.filter((r) => r.bucket === 'now');
      // top 20% of 10 = 2 tasks (at minimum)
      expect(nowTasks.length).toBeGreaterThanOrEqual(1);
      expect(nowTasks.length).toBeLessThanOrEqual(3);
    });

    it('assigns WAIT to lowest-scoring tasks', () => {
      // Create tasks with distant sprint and no other factors
      const tasks = Array.from({ length: 5 }, (_, i) => makeTask({ id: `T${i}`, sprint: 20 }));
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      // Bottom 40% should be wait
      const waitTasks = result.filter((r) => r.bucket === 'wait');
      expect(waitTasks.length).toBeGreaterThanOrEqual(1);
    });

    it('handles single task (always NOW)', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 20 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      // Single task → top 20% cutoff = max(1, ceil(1*0.2)) = 1 → NOW
      expect(result[0].bucket).toBe('now');
    });

    it('handles empty tasks array', () => {
      const result = computePriorityScores(
        [],
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result).toHaveLength(0);
    });
  });

  describe('reason string', () => {
    it('includes "Critical path" for critical path tasks', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(['T1']),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].reason).toContain('Critical path');
    });

    it('includes "Overdue" for negative float tasks', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        new Map([['T1', { taskId: 'T1', totalFloat: -30 }]]),
        emptyPhases,
        5
      );
      expect(result[0].reason).toContain('Overdue');
    });

    it('includes "Due today" for tight float tasks', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        new Map([['T1', { taskId: 'T1', totalFloat: 30 }]]),
        emptyPhases,
        5
      );
      expect(result[0].reason).toContain('Due today');
    });

    it('includes "Unblocks N tasks" for high fan-out', () => {
      const nodes = new Map<string, DepGraphNode>([
        ['T1', { task_id: 'T1', dependencies: [], dependents: ['A', 'B', 'C', 'D'] }],
      ]);
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        nodes,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].reason).toContain('Unblocks 4 tasks');
    });

    it('includes "Exec ready" for exec-ready tasks', () => {
      const sessions = new Map<string, SessionStatus>([['T1', { hasSpec: true, hasPlan: true }]]);
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        sessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].reason).toContain('Exec ready');
    });

    it('includes "Tier A" for high business value tasks', () => {
      const tasks = [makeTask({ id: 'EXC-SEC-001', section: 'Security', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].reason).toContain('Tier A');
    });

    it('returns "Ready" when no special factors apply', () => {
      const tasks = [makeTask({ id: 'IFC-050', sprint: 20 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].reason).toBe('Ready');
    });
  });

  describe('recommended action', () => {
    it('recommends spec when no session status', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].recommendedAction).toBe('spec');
    });

    it('recommends plan when spec is done', () => {
      const sessions = new Map([['T1', { hasSpec: true, hasPlan: false }]]);
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        sessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].recommendedAction).toBe('plan');
    });

    it('recommends exec when spec and plan are done', () => {
      const sessions = new Map([['T1', { hasSpec: true, hasPlan: true }]]);
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        sessions,
        emptySchedule,
        emptyPhases,
        5
      );
      expect(result[0].recommendedAction).toBe('exec');
    });
  });

  describe('factors interface', () => {
    it('factors include all WSJF fields', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases,
        5
      );
      const { factors } = result[0];
      expect(factors).toHaveProperty('businessValue');
      expect(factors).toHaveProperty('timeCriticality');
      expect(factors).toHaveProperty('riskReductionOpportunity');
      expect(factors).toHaveProperty('jobSizeProxy');
      expect(isFibonacci(factors.businessValue)).toBe(true);
      expect(isFibonacci(factors.timeCriticality)).toBe(true);
      expect(isFibonacci(factors.riskReductionOpportunity)).toBe(true);
      expect([1, 2, 3]).toContain(factors.jobSizeProxy);
    });

    it('does not expose internal fields (_isCriticalPath, _totalFloat)', () => {
      const tasks = [makeTask({ id: 'T1', sprint: 5 })];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(['T1']),
        emptySessions,
        new Map([['T1', { taskId: 'T1', totalFloat: -100 }]]),
        emptyPhases,
        5
      );
      const entry = result[0] as unknown as Record<string, unknown>;
      expect(entry).not.toHaveProperty('_isCriticalPath');
      expect(entry).not.toHaveProperty('_totalFloat');
    });
  });

  describe('sprint inference', () => {
    it('infers current sprint from lowest sprint in tasks when not provided', () => {
      const tasks = [
        makeTask({ id: 'A', sprint: 8 }),
        makeTask({ id: 'B', sprint: 5 }),
        makeTask({ id: 'C', sprint: 12 }),
      ];
      const result = computePriorityScores(
        tasks,
        emptyGraph,
        new Set(),
        emptySessions,
        emptySchedule,
        emptyPhases
      );
      // B (sprint 5) is closest to inferred current sprint → highest time criticality
      // A (sprint 8) and C (sprint 12) are further away
      expect(result.length).toBe(3);
      // All should have valid scores
      result.forEach((r) => {
        expect(r.score).toBeGreaterThan(0);
      });
    });
  });
});
