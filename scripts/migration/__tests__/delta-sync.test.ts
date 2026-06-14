import { describe, it, expect } from 'vitest';
import {
  transformValue,
  generateCuid,
  TRANSFORMATION_RULES,
  ENUM_MAPPINGS,
  type TransformationRule,
} from '../delta-sync';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ============================================
// Helper: create a rule for testing
// ============================================
function makeRule(
  overrides: Partial<TransformationRule> & { transformationType: string }
): TransformationRule {
  return {
    sourceTable: 'test',
    targetTable: 'Test',
    sourceField: 'field',
    targetField: 'field',
    ...overrides,
  };
}

// ============================================
// transformValue() tests
// ============================================
describe('transformValue', () => {
  it('id_mapping generates CUID and reuses for same legacy ID', () => {
    const idMap = new Map<string, string>();
    const rule = makeRule({ transformationType: 'id_mapping' });

    const result1 = transformValue(42, rule, idMap);
    const result2 = transformValue(42, rule, idMap);
    const result3 = transformValue(99, rule, idMap);

    expect(result1).toBe(result2); // Same legacy ID → same new ID
    expect(result1).not.toBe(result3); // Different legacy ID → different new ID
    expect(typeof result1).toBe('string');
  });

  it('email_normalize lowercases and trims emails', () => {
    const rule = makeRule({ transformationType: 'email_normalize' });
    const idMap = new Map<string, string>();

    expect(transformValue('  USER@Example.COM  ', rule, idMap)).toBe('user@example.com');
    expect(transformValue('Admin@TEST.org', rule, idMap)).toBe('admin@test.org');
  });

  it('enum_mapping translates legacy INT to string enums (all tables)', () => {
    const idMap = new Map<string, string>();

    // users.role
    const roleRule = makeRule({
      sourceTable: 'users',
      sourceField: 'role',
      transformationType: 'enum_mapping',
    });
    expect(transformValue(0, roleRule, idMap)).toBe('USER');
    expect(transformValue(1, roleRule, idMap)).toBe('ADMIN');
    expect(transformValue(2, roleRule, idMap)).toBe('MANAGER');
    expect(transformValue(3, roleRule, idMap)).toBe('SALES_REP');

    // leads.source
    const sourceRule = makeRule({
      sourceTable: 'leads',
      sourceField: 'source',
      transformationType: 'enum_mapping',
    });
    expect(transformValue(0, sourceRule, idMap)).toBe('WEBSITE');
    expect(transformValue(4, sourceRule, idMap)).toBe('PHONE');

    // leads.status
    const statusRule = makeRule({
      sourceTable: 'leads',
      sourceField: 'status',
      transformationType: 'enum_mapping',
    });
    expect(transformValue(0, statusRule, idMap)).toBe('NEW');
    expect(transformValue(5, statusRule, idMap)).toBe('WON');

    // opportunities.stage
    const stageRule = makeRule({
      sourceTable: 'opportunities',
      sourceField: 'stage',
      transformationType: 'enum_mapping',
    });
    expect(transformValue(0, stageRule, idMap)).toBe('PROSPECTING');
    expect(transformValue(7, stageRule, idMap)).toBe('CLOSED_WON');
    expect(transformValue(8, stageRule, idMap)).toBe('CLOSED_LOST');
  });

  it('enum_mapping returns original value for unknown mappings', () => {
    const rule = makeRule({
      sourceTable: 'users',
      sourceField: 'role',
      transformationType: 'enum_mapping',
    });
    const idMap = new Map<string, string>();

    expect(transformValue(999, rule, idMap)).toBe('999');
  });

  it('score_clamp clamps to 0-100 range', () => {
    const rule = makeRule({ transformationType: 'score_clamp' });
    const idMap = new Map<string, string>();

    expect(transformValue(-10, rule, idMap)).toBe(0);
    expect(transformValue(150, rule, idMap)).toBe(100);
    expect(transformValue(50, rule, idMap)).toBe(50);
  });

  it('probability_clamp clamps to 0-100 range', () => {
    const rule = makeRule({ transformationType: 'probability_clamp' });
    const idMap = new Map<string, string>();

    expect(transformValue(-5, rule, idMap)).toBe(0);
    expect(transformValue(200, rule, idMap)).toBe(100);
    expect(transformValue(75, rule, idMap)).toBe(75);
  });

  it('date_parse converts to ISO 8601 string', () => {
    const rule = makeRule({ transformationType: 'date_parse' });
    const idMap = new Map<string, string>();

    const result = transformValue('2025-01-15T10:30:00Z', rule, idMap);
    expect(result).toBe('2025-01-15T10:30:00.000Z');
  });

  it('fk_lookup resolves foreign key via idMap', () => {
    const rule = makeRule({ transformationType: 'fk_lookup' });
    const idMap = new Map<string, string>([['legacy-123', 'new-456']]);

    expect(transformValue('legacy-123', rule, idMap)).toBe('new-456');
  });

  it('fk_lookup returns original if not in idMap', () => {
    const rule = makeRule({ transformationType: 'fk_lookup' });
    const idMap = new Map<string, string>();

    expect(transformValue('unknown-id', rule, idMap)).toBe('unknown-id');
  });

  it('url_validate prefixes with https:// if missing', () => {
    const rule = makeRule({ transformationType: 'url_validate' });
    const idMap = new Map<string, string>();

    expect(transformValue('example.com', rule, idMap)).toBe('https://example.com');
    expect(transformValue('https://example.com', rule, idMap)).toBe('https://example.com');
    expect(transformValue('http://example.com', rule, idMap)).toBe('http://example.com');
  });

  it('decimal_precision rounds to 2 decimal places', () => {
    const rule = makeRule({ transformationType: 'decimal_precision' });
    const idMap = new Map<string, string>();

    expect(transformValue(123.456789, rule, idMap)).toBe(123.46);
    expect(transformValue(100, rule, idMap)).toBe(100);
    expect(transformValue(99.999, rule, idMap)).toBe(100);
  });

  it('null/undefined input returns defaultValue or null', () => {
    const rule = makeRule({ transformationType: 'id_mapping', defaultValue: 'fallback' });
    const idMap = new Map<string, string>();

    expect(transformValue(null, rule, idMap)).toBe('fallback');
    expect(transformValue(undefined, rule, idMap)).toBe('fallback');

    const ruleNoDefault = makeRule({ transformationType: 'id_mapping' });
    expect(transformValue(null, ruleNoDefault, idMap)).toBeNull();
  });
});

// ============================================
// generateCuid() tests
// ============================================
describe('generateCuid', () => {
  it('returns string starting with c', () => {
    const id = generateCuid();
    expect(typeof id).toBe('string');
    expect(id.startsWith('c')).toBe(true);
    expect(id.length).toBeGreaterThan(5);
  });
});

// ============================================
// TRANSFORMATION_RULES tests
// ============================================
describe('TRANSFORMATION_RULES', () => {
  it('covers all 5 entity tables', () => {
    const tables = new Set(TRANSFORMATION_RULES.map((r) => r.sourceTable));
    expect(tables).toContain('users');
    expect(tables).toContain('leads');
    expect(tables).toContain('contacts');
    expect(tables).toContain('accounts');
    expect(tables).toContain('opportunities');
    expect(tables.size).toBe(5);
  });
});

// ============================================
// ENUM_MAPPINGS tests
// ============================================
describe('ENUM_MAPPINGS', () => {
  it('maps all enum values for users.role, leads.source, leads.status, opportunities.stage', () => {
    expect(ENUM_MAPPINGS.users.role).toBeDefined();
    expect(Object.keys(ENUM_MAPPINGS.users.role).length).toBeGreaterThanOrEqual(4);

    expect(ENUM_MAPPINGS.leads.source).toBeDefined();
    expect(Object.keys(ENUM_MAPPINGS.leads.source).length).toBeGreaterThanOrEqual(7);

    expect(ENUM_MAPPINGS.leads.status).toBeDefined();
    expect(Object.keys(ENUM_MAPPINGS.leads.status).length).toBeGreaterThanOrEqual(7);

    expect(ENUM_MAPPINGS.opportunities.stage).toBeDefined();
    expect(Object.keys(ENUM_MAPPINGS.opportunities.stage).length).toBeGreaterThanOrEqual(9);
  });

  it('completeness: all integer values in source range have mappings (no gaps)', () => {
    for (const [table, fields] of Object.entries(ENUM_MAPPINGS)) {
      for (const [field, mapping] of Object.entries(fields)) {
        const keys = Object.keys(mapping)
          .map(Number)
          .sort((a, b) => a - b);
        const min = keys[0];
        const max = keys[keys.length - 1];
        for (let i = min; i <= max; i++) {
          expect(mapping[i]).toBeDefined(`${table}.${field}: missing mapping for integer key ${i}`);
        }
      }
    }
  });
});

// ============================================
// RED tests — functions not yet implemented
// ============================================
describe('checkpoint/resume (RED — not yet implemented)', () => {
  it('saveCheckpoint() persists state, loadCheckpoint() restores', async () => {
    // These functions don't exist yet — importing should fail or function should not exist
    const mod = await import('../delta-sync');
    expect(typeof (mod as Record<string, unknown>).saveCheckpoint).toBe('function');
    expect(typeof (mod as Record<string, unknown>).loadCheckpoint).toBe('function');

    const state = {
      tableName: 'users',
      lastProcessedId: '42',
      idMap: { '1': 'c123' },
      timestamp: new Date().toISOString(),
    };
    const path = join(tmpdir(), 'test-checkpoint.json');
    await (
      mod as Record<string, unknown> as { saveCheckpoint: (s: unknown, p: string) => Promise<void> }
    ).saveCheckpoint(state, path);
    const loaded = await (
      mod as Record<string, unknown> as { loadCheckpoint: (p: string) => Promise<unknown> }
    ).loadCheckpoint(path);
    expect(loaded).toMatchObject(state);
  });
});

describe('circuit breaker', () => {
  it('opens after threshold consecutive failures, rejects new calls when open', async () => {
    const mod = await import('../delta-sync');
    const CircuitBreaker = (mod as Record<string, unknown>).CircuitBreaker as new (opts: {
      threshold: number;
      cooldown: number;
    }) => {
      execute: <T>(fn: () => Promise<T>) => Promise<T>;
      getState: () => string;
    };
    expect(CircuitBreaker).toBeDefined();

    const breaker = new CircuitBreaker({ threshold: 3, cooldown: 100 });
    expect(breaker.getState()).toBe('CLOSED');

    const fail = () => Promise.reject(new Error('fail'));

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }

    expect(breaker.getState()).toBe('OPEN');

    // Should now reject
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow();
  });
});

describe('governance columns (RED — not yet implemented)', () => {
  it('addGovernanceColumns() adds classification, retention, legal_hold per ADR-007', async () => {
    const mod = await import('../delta-sync');
    const addGovernanceColumns = (mod as Record<string, unknown>).addGovernanceColumns as (
      record: Record<string, unknown>,
      entityType: string
    ) => Record<string, unknown>;

    expect(typeof addGovernanceColumns).toBe('function');

    const userRecord = addGovernanceColumns({}, 'User');
    expect(userRecord.dataClassification).toBe('CONFIDENTIAL');
    expect(userRecord.retentionYears).toBe(7);
    expect(userRecord.legalHold).toBe(false);

    // Per-entity retention: Account→7y, Opportunity→5y (NOT simple classification lookup)
    const accountRecord = addGovernanceColumns({}, 'Account');
    expect(accountRecord.dataClassification).toBe('INTERNAL');
    expect(accountRecord.retentionYears).toBe(7);

    const oppRecord = addGovernanceColumns({}, 'Opportunity');
    expect(oppRecord.dataClassification).toBe('INTERNAL');
    expect(oppRecord.retentionYears).toBe(5);

    const leadRecord = addGovernanceColumns({}, 'Lead');
    expect(leadRecord.retentionYears).toBe(3);
  });
});

describe('PII redaction (RED — not yet implemented)', () => {
  it('sanitizeForLog() removes email, phone, firstName, lastName', async () => {
    const mod = await import('../delta-sync');
    const sanitizeForLog = (mod as Record<string, unknown>).sanitizeForLog as (
      record: Record<string, unknown>
    ) => Record<string, unknown>;

    expect(typeof sanitizeForLog).toBe('function');

    const sanitized = sanitizeForLog({
      id: '123',
      email: 'test@example.com',
      phone: '+1234567890',
      firstName: 'John',
      lastName: 'Doe',
      score: 85,
    });

    expect(sanitized.id).toBe('123');
    expect(sanitized.score).toBe(85);
    expect(sanitized.email).toBeUndefined();
    expect(sanitized.phone).toBeUndefined();
    expect(sanitized.firstName).toBeUndefined();
    expect(sanitized.lastName).toBeUndefined();
  });
});

describe('schema drift', () => {
  it('validateSchemaVersion() rejects mismatched source schema version', async () => {
    const mod = await import('../delta-sync');
    const validateSchemaVersion = (mod as Record<string, unknown>)
      .validateSchemaVersion as (sourceSchema: { version: string }) => {
      valid: boolean;
      message: string;
    };

    expect(typeof validateSchemaVersion).toBe('function');

    const invalid = validateSchemaVersion({ version: '0.0.0' });
    expect(invalid.valid).toBe(false);
  });

  it('validateSchemaVersion() accepts matching schema version', async () => {
    const mod = await import('../delta-sync');
    const validateSchemaVersion = (mod as Record<string, unknown>)
      .validateSchemaVersion as (sourceSchema: { version: string }) => {
      valid: boolean;
      message: string;
    };
    const EXPECTED_SCHEMA_VERSION = (mod as Record<string, unknown>)
      .EXPECTED_SCHEMA_VERSION as string;

    const valid = validateSchemaVersion({ version: EXPECTED_SCHEMA_VERSION });
    expect(valid.valid).toBe(true);
    expect(valid.message).toContain('matches');
  });
});

describe('checkpoint error handling', () => {
  it('loadCheckpoint() returns null for non-existent file', async () => {
    const mod = await import('../delta-sync');
    const loadCheckpoint = (mod as Record<string, unknown>).loadCheckpoint as (
      path: string
    ) => Promise<unknown>;

    const result = await loadCheckpoint(join(tmpdir(), 'nonexistent-checkpoint-12345.json'));
    expect(result).toBeNull();
  });
});
