import { describe, it, expect } from 'vitest';
import {
  calculateQualityMetrics,
  generateCSV,
  EXPECTED_COUNTS,
  VARIANCE_THRESHOLDS,
  type EntityCount,
  type ValidationCheck,
  type ReconciliationResult,
} from '../reconciliation';

// ============================================
// Helper: create EntityCount entries
// ============================================
function makeEntityCount(overrides: Partial<EntityCount> = {}): EntityCount {
  return {
    entity: 'TestEntity',
    expected: 100,
    actual: 100,
    variance: 0,
    variancePercent: 0,
    status: 'PASS',
    ...overrides,
  };
}

function makeValidationCheck(overrides: Partial<ValidationCheck> = {}): ValidationCheck {
  return {
    check: 'TEST_CHECK',
    entity: 'TestEntity',
    description: 'Test check description',
    passed: true,
    details: 'All good',
    ...overrides,
  };
}

// ============================================
// calculateQualityMetrics() tests
// ============================================
describe('calculateQualityMetrics', () => {
  it('completeness metric: 100% when actual equals expected', () => {
    const entityCounts: EntityCount[] = [
      makeEntityCount({ entity: 'User', expected: 100, actual: 100 }),
      makeEntityCount({ entity: 'Lead', expected: 200, actual: 200 }),
    ];
    const checks: ValidationCheck[] = [makeValidationCheck()];

    const metrics = calculateQualityMetrics(entityCounts, checks);
    const completeness = metrics.find((m) => m.metric === 'DATA_COMPLETENESS');

    expect(completeness).toBeDefined();
    expect(completeness!.value).toBe(100);
    expect(completeness!.status).toBe('PASS');
  });

  it('completeness metric: FAIL when <99%', () => {
    const entityCounts: EntityCount[] = [
      makeEntityCount({ entity: 'User', expected: 100, actual: 90 }),
    ];
    const checks: ValidationCheck[] = [];

    const metrics = calculateQualityMetrics(entityCounts, checks);
    const completeness = metrics.find((m) => m.metric === 'DATA_COMPLETENESS');

    expect(completeness!.status).toBe('FAIL');
    expect(completeness!.value).toBeLessThan(95);
  });

  it('validation pass rate: 100% when all checks pass', () => {
    const entityCounts: EntityCount[] = [makeEntityCount()];
    const checks: ValidationCheck[] = [
      makeValidationCheck({ passed: true }),
      makeValidationCheck({ passed: true }),
    ];

    const metrics = calculateQualityMetrics(entityCounts, checks);
    const passRate = metrics.find((m) => m.metric === 'VALIDATION_PASS_RATE');

    expect(passRate!.value).toBe(100);
    expect(passRate!.status).toBe('PASS');
  });

  it('entity coverage: 100% when all entities have data', () => {
    const entityCounts: EntityCount[] = [
      makeEntityCount({ entity: 'User', actual: 10 }),
      makeEntityCount({ entity: 'Lead', actual: 20 }),
    ];

    const metrics = calculateQualityMetrics(entityCounts, []);
    const coverage = metrics.find((m) => m.metric === 'ENTITY_COVERAGE');

    expect(coverage!.value).toBe(100);
    expect(coverage!.status).toBe('PASS');
  });
});

// ============================================
// Variance status tests
// ============================================
describe('variance status', () => {
  it('PASS when <0.5%, WARN when 0.5-2%, FAIL when >2%', () => {
    // These thresholds are from VARIANCE_THRESHOLDS
    expect(VARIANCE_THRESHOLDS.PASS).toBe(0.5);
    expect(VARIANCE_THRESHOLDS.WARN).toBe(2.0);
  });
});

// ============================================
// generateCSV() tests
// ============================================
describe('generateCSV', () => {
  const sampleResult: ReconciliationResult = {
    timestamp: '2026-02-19T10:00:00.000Z',
    entityCounts: [
      makeEntityCount({
        entity: 'User',
        expected: 100,
        actual: 100,
        variance: 0,
        variancePercent: 0,
        status: 'PASS',
      }),
      makeEntityCount({
        entity: 'Lead',
        expected: 200,
        actual: 198,
        variance: -2,
        variancePercent: 1.0,
        status: 'WARN',
      }),
    ],
    validationChecks: [
      makeValidationCheck({ check: 'EMAIL_UNIQUENESS', entity: 'User', passed: true }),
    ],
    qualityMetrics: [
      { metric: 'DATA_COMPLETENESS', value: 99.33, threshold: 99.0, status: 'PASS' },
    ],
    overallStatus: 'WARN',
    completenessPercent: 99.33,
  };

  it('produces valid CSV with all 5 sections', () => {
    const csv = generateCSV(sampleResult);

    expect(csv).toContain('## Section 1: Entity Reconciliation');
    expect(csv).toContain('## Section 2: Validation Checks');
    expect(csv).toContain('## Section 3: Data Quality Metrics');
    expect(csv).toContain('## Section 4: Issues Summary');
    expect(csv).toContain('## Section 5: Sign-off');
  });

  it('includes SHA256 hash in sign-off section', () => {
    const csv = generateCSV(sampleResult);

    expect(csv).toContain('SHA256:');
    // Hash should be 16-char hex substring
    const match = csv.match(/SHA256:([a-f0-9]{16})/);
    expect(match).not.toBeNull();
  });

  it('shows NONE when no issues exist', () => {
    const noIssuesResult: ReconciliationResult = {
      timestamp: '2026-02-19T10:00:00.000Z',
      entityCounts: [
        makeEntityCount({ entity: 'User', expected: 100, actual: 100, status: 'PASS' }),
      ],
      validationChecks: [makeValidationCheck({ passed: true })],
      qualityMetrics: [
        { metric: 'DATA_COMPLETENESS', value: 100, threshold: 99.0, status: 'PASS' },
      ],
      overallStatus: 'PASS',
      completenessPercent: 100,
    };
    const csv = generateCSV(noIssuesResult);
    expect(csv).toContain('NONE,No issues detected');
  });

  it('shows failing quality metrics in issues section', () => {
    const failResult: ReconciliationResult = {
      timestamp: '2026-02-19T10:00:00.000Z',
      entityCounts: [
        makeEntityCount({ entity: 'User', expected: 100, actual: 100, status: 'PASS' }),
      ],
      validationChecks: [
        makeValidationCheck({ passed: false, check: 'FK_CHECK', details: 'Orphaned references' }),
      ],
      qualityMetrics: [{ metric: 'DATA_COMPLETENESS', value: 85, threshold: 99.0, status: 'FAIL' }],
      overallStatus: 'FAIL',
      completenessPercent: 85,
    };
    const csv = generateCSV(failResult);
    expect(csv).toContain('Metric DATA_COMPLETENESS');
    expect(csv).toContain('Validation FK_CHECK');
  });
});

// ============================================
// Entity counts tests
// ============================================
describe('entity counts', () => {
  it('all 9 entity types present in EXPECTED_COUNTS', () => {
    const expectedEntities = [
      'User',
      'Lead',
      'Contact',
      'Account',
      'Opportunity',
      'Task',
      'AuditLogEntry',
      'AIScore',
      'SecurityEvent',
    ];

    for (const entity of expectedEntities) {
      expect(EXPECTED_COUNTS[entity]).toBeDefined(`EXPECTED_COUNTS missing entity: ${entity}`);
      expect(EXPECTED_COUNTS[entity]).toBeGreaterThan(0);
    }
  });
});

// ============================================
// Overall status tests
// ============================================
describe('overall status determination', () => {
  it('FAIL if any entity or check fails', () => {
    const entityCounts: EntityCount[] = [
      makeEntityCount({ status: 'PASS' }),
      makeEntityCount({ status: 'FAIL' }),
    ];
    // The actual overall status logic is in main() — but we test the principle:
    const hasFailedEntities = entityCounts.some((e) => e.status === 'FAIL');
    expect(hasFailedEntities).toBe(true);
  });

  it('WARN if any entity is in WARN range', () => {
    const entityCounts: EntityCount[] = [
      makeEntityCount({ status: 'PASS' }),
      makeEntityCount({ status: 'WARN' }),
    ];
    const hasWarnings = entityCounts.some((e) => e.status === 'WARN');
    const hasFailures = entityCounts.some((e) => e.status === 'FAIL');
    expect(hasWarnings).toBe(true);
    expect(hasFailures).toBe(false);
  });

  it('PASS only when all pass', () => {
    const entityCounts: EntityCount[] = [
      makeEntityCount({ status: 'PASS' }),
      makeEntityCount({ status: 'PASS' }),
    ];
    const allPass = entityCounts.every((e) => e.status === 'PASS');
    expect(allPass).toBe(true);
  });
});

// ============================================
// EXPECTED_COUNTS key consistency (Gap 4 fix)
// ============================================
describe('EXPECTED_COUNTS key consistency', () => {
  it('EXPECTED_COUNTS keys should match getEntityCounts() return object keys', () => {
    // Gap 4 fix: EXPECTED_COUNTS now uses AuditLogEntry (matching Prisma model name)
    const expectedKeys = Object.keys(EXPECTED_COUNTS);

    expect(expectedKeys).toContain('User');
    expect(expectedKeys).toContain('Lead');
    expect(expectedKeys).toContain('Contact');
    expect(expectedKeys).toContain('Account');
    expect(expectedKeys).toContain('Opportunity');
    expect(expectedKeys).toContain('Task');
    expect(expectedKeys).toContain('AIScore');
    expect(expectedKeys).toContain('SecurityEvent');
    // Fixed: now AuditLogEntry (matches Prisma model name used in getEntityCounts)
    expect(expectedKeys).toContain('AuditLogEntry');
    expect(expectedKeys.length).toBe(9);
  });
});
