/**
 * Chain Version Validators Tests - IFC-086
 *
 * Tests for chain version Zod schemas and utilities
 */

import { describe, it, expect } from 'vitest';
import {
  chainTypeSchema,
  chainVersionStatusSchema,
  versionRolloutStrategySchema,
  chainConfigSchema,
  createChainVersionSchema,
  updateChainVersionSchema,
  activateVersionSchema,
  rollbackVersionSchema,
  chainVersionSchema,
  versionContextSchema,
  canActivateVersion,
  formatVersionInfo,
  getVersionAge,
} from '../src/chain-version';

describe('chainTypeSchema', () => {
  it('should accept valid chain types', () => {
    expect(chainTypeSchema.parse('SCORING')).toBe('SCORING');
    expect(chainTypeSchema.parse('QUALIFICATION')).toBe('QUALIFICATION');
    expect(chainTypeSchema.parse('EMAIL_WRITER')).toBe('EMAIL_WRITER');
    expect(chainTypeSchema.parse('FOLLOWUP')).toBe('FOLLOWUP');
  });

  it('should reject invalid chain types', () => {
    expect(() => chainTypeSchema.parse('INVALID')).toThrow();
    expect(() => chainTypeSchema.parse('')).toThrow();
    expect(() => chainTypeSchema.parse(123)).toThrow();
  });
});

describe('chainVersionStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(chainVersionStatusSchema.parse('DRAFT')).toBe('DRAFT');
    expect(chainVersionStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
    expect(chainVersionStatusSchema.parse('DEPRECATED')).toBe('DEPRECATED');
    expect(chainVersionStatusSchema.parse('ARCHIVED')).toBe('ARCHIVED');
  });

  it('should reject invalid statuses', () => {
    expect(() => chainVersionStatusSchema.parse('PENDING')).toThrow();
    expect(() => chainVersionStatusSchema.parse('DELETED')).toThrow();
  });
});

describe('versionRolloutStrategySchema', () => {
  it('should accept valid strategies', () => {
    expect(versionRolloutStrategySchema.parse('IMMEDIATE')).toBe('IMMEDIATE');
    expect(versionRolloutStrategySchema.parse('PERCENTAGE')).toBe('PERCENTAGE');
    expect(versionRolloutStrategySchema.parse('AB_TEST')).toBe('AB_TEST');
  });

  it('should reject invalid strategies', () => {
    expect(() => versionRolloutStrategySchema.parse('GRADUAL')).toThrow();
  });
});

describe('chainConfigSchema', () => {
  it('should accept valid config with all fields', () => {
    const config = {
      prompt: 'You are an expert lead scorer. Analyze leads and provide scores.',
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      additionalParams: { topP: 0.9 },
    };

    const result = chainConfigSchema.parse(config);
    expect(result.prompt).toBe(config.prompt);
    expect(result.model).toBe(config.model);
    expect(result.temperature).toBe(0.7);
    expect(result.maxTokens).toBe(2000);
  });

  it('should accept config with optional fields omitted', () => {
    const config = {
      prompt: 'Minimal config with enough characters to pass validation',
      model: 'gpt-4',
      temperature: 0.5,
      maxTokens: 1000,
    };

    const result = chainConfigSchema.parse(config);
    expect(result.additionalParams).toBeUndefined();
  });

  it('should reject invalid temperature', () => {
    const config = {
      prompt: 'Test prompt with sufficient length',
      model: 'gpt-4',
      temperature: 2.5, // Invalid: > 2
      maxTokens: 1000,
    };

    expect(() => chainConfigSchema.parse(config)).toThrow();
  });

  it('should reject negative maxTokens', () => {
    const config = {
      prompt: 'Test prompt with sufficient length',
      model: 'gpt-4',
      temperature: 0.5,
      maxTokens: -100,
    };

    expect(() => chainConfigSchema.parse(config)).toThrow();
  });
});

describe('createChainVersionSchema', () => {
  it('should accept valid creation input', () => {
    const input = {
      chainType: 'SCORING' as const,
      prompt: 'You are an expert lead scorer. Analyze and score leads accurately.',
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      description: 'Initial scoring prompt',
      rolloutStrategy: 'IMMEDIATE' as const,
    };

    const result = createChainVersionSchema.parse(input);
    expect(result.chainType).toBe('SCORING');
    expect(result.rolloutStrategy).toBe('IMMEDIATE');
  });

  it('should apply default rollout strategy', () => {
    const input = {
      chainType: 'QUALIFICATION' as const,
      prompt: 'Test prompt with enough characters for validation to pass',
      model: 'gpt-4',
      temperature: 0.5,
      maxTokens: 1000,
    };

    const result = createChainVersionSchema.parse(input);
    expect(result.rolloutStrategy).toBe('IMMEDIATE');
  });

  it('should accept rolloutPercent for PERCENTAGE strategy', () => {
    const input = {
      chainType: 'SCORING' as const,
      prompt: 'Test prompt with enough characters for validation to pass correctly',
      model: 'gpt-4',
      temperature: 0.5,
      maxTokens: 1000,
      rolloutStrategy: 'PERCENTAGE' as const,
      rolloutPercent: 50,
    };

    const result = createChainVersionSchema.parse(input);
    expect(result.rolloutPercent).toBe(50);
  });
});

describe('updateChainVersionSchema', () => {
  it('should accept partial updates', () => {
    const update = {
      prompt: 'Updated prompt',
    };

    const result = updateChainVersionSchema.parse(update);
    expect(result.prompt).toBe('Updated prompt');
    expect(result.model).toBeUndefined();
  });

  it('should accept multiple field updates', () => {
    const update = {
      prompt: 'New prompt',
      temperature: 0.8,
      description: 'Updated description',
    };

    const result = updateChainVersionSchema.parse(update);
    expect(result.prompt).toBe('New prompt');
    expect(result.temperature).toBe(0.8);
    expect(result.description).toBe('Updated description');
  });
});

describe('activateVersionSchema', () => {
  it('should accept valid UUID', () => {
    const input = {
      versionId: '550e8400-e29b-41d4-a716-446655440000',
    };

    const result = activateVersionSchema.parse(input);
    expect(result.versionId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should reject invalid UUID', () => {
    expect(() => activateVersionSchema.parse({ versionId: 'not-a-uuid' })).toThrow();
  });
});

describe('rollbackVersionSchema', () => {
  it('should accept valid rollback input', () => {
    const input = {
      versionId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Performance regression detected after v2 deployment',
    };

    const result = rollbackVersionSchema.parse(input);
    expect(result.versionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.reason).toBe('Performance regression detected after v2 deployment');
  });

  it('should reject reason shorter than 10 characters', () => {
    const input = {
      versionId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Too short',
    };

    expect(() => rollbackVersionSchema.parse(input)).toThrow();
  });
});

describe('chainVersionSchema', () => {
  it('should accept complete version object', () => {
    const version = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      chainType: 'SCORING' as const,
      status: 'ACTIVE' as const,
      prompt: 'You are an expert.',
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      additionalParams: null,
      description: null,
      parentVersionId: null,
      rolloutStrategy: 'IMMEDIATE' as const,
      rolloutPercent: null,
      experimentId: null,
      createdBy: 'user-123',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: 'tenant-456',
    };

    const result = chainVersionSchema.parse(version);
    expect(result.id).toBe(version.id);
    expect(result.chainType).toBe('SCORING');
    expect(result.status).toBe('ACTIVE');
  });
});

describe('versionContextSchema', () => {
  it('should accept context with all fields', () => {
    const context = {
      tenantId: 'tenant-123',
      userId: 'user-456',
      sessionId: 'session-789',
      leadId: 'clfq3n1zy0000v7xk4k5k5k5k', // Valid CUID
      experimentId: 'clfq3n1zy0001v7xk4k5k5k5k', // Valid CUID
    };

    const result = versionContextSchema.parse(context);
    expect(result.tenantId).toBe('tenant-123');
    expect(result.userId).toBe('user-456');
  });

  it('should accept context with only tenantId', () => {
    const context = {
      tenantId: 'tenant-123',
    };

    const result = versionContextSchema.parse(context);
    expect(result.tenantId).toBe('tenant-123');
    expect(result.userId).toBeUndefined();
  });
});

describe('canActivateVersion', () => {
  const createMockVersion = (status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED') => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    chainType: 'SCORING' as const,
    status,
    prompt: 'You are an expert lead scorer with many skills.',
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
    additionalParams: null,
    description: null,
    parentVersionId: null,
    rolloutStrategy: 'IMMEDIATE' as const,
    rolloutPercent: null,
    experimentId: null,
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    tenantId: 'tenant-456',
  });

  it('should allow activation of DRAFT status', () => {
    const version = createMockVersion('DRAFT');
    const result = canActivateVersion(version, null);
    expect(result.canActivate).toBe(true);
  });

  it('should not allow activation of ACTIVE status', () => {
    const version = createMockVersion('ACTIVE');
    const result = canActivateVersion(version, null);
    expect(result.canActivate).toBe(false);
  });

  it('should not allow activation of DEPRECATED status', () => {
    const version = createMockVersion('DEPRECATED');
    const result = canActivateVersion(version, null);
    expect(result.canActivate).toBe(false);
  });

  it('should not allow activation of ARCHIVED status', () => {
    const version = createMockVersion('ARCHIVED');
    const result = canActivateVersion(version, null);
    expect(result.canActivate).toBe(false);
  });
});

describe('formatVersionInfo', () => {
  it('should format version info correctly', () => {
    const version = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      chainType: 'SCORING' as const,
      status: 'ACTIVE' as const,
      prompt: 'You are an expert.',
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      additionalParams: null,
      description: null,
      parentVersionId: null,
      rolloutStrategy: 'IMMEDIATE' as const,
      rolloutPercent: null,
      experimentId: null,
      createdBy: 'user-123',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      tenantId: 'tenant-456',
    };

    const formatted = formatVersionInfo(version);
    expect(formatted).toContain('SCORING');
    expect(formatted).toContain('550e8400');
    expect(formatted).toContain('gpt-4-turbo-preview');
  });
});

describe('getVersionAge', () => {
  const createVersionWithAge = (createdAt: Date) => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    chainType: 'SCORING' as const,
    status: 'ACTIVE' as const,
    prompt: 'You are an expert.',
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
    additionalParams: null,
    description: null,
    parentVersionId: null,
    rolloutStrategy: 'IMMEDIATE' as const,
    rolloutPercent: null,
    experimentId: null,
    createdBy: 'user-123',
    createdAt,
    updatedAt: new Date(),
    tenantId: 'tenant-456',
  });

  it('should calculate age correctly for recent versions', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const version = createVersionWithAge(oneHourAgo);
    const age = getVersionAge(version);
    // Function uses day granularity - less than 24 hours returns "Created today"
    expect(age).toBe('Created today');
  });

  it('should calculate age correctly for older versions', () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const version = createVersionWithAge(threeDaysAgo);
    const age = getVersionAge(version);
    expect(age).toBe('Created 3 days ago');
  });

  it('should handle recent dates', () => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const version = createVersionWithAge(fiveMinutesAgo);
    const age = getVersionAge(version);
    // Function uses day granularity - less than 24 hours returns "Created today"
    expect(age).toBe('Created today');
  });
});
