/**
 * Unit tests for contract-parser.ts
 *
 * @module tools/scripts/lib/contract-parser.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseTag,
  parseTagList,
  containsEllipsis,
  parseTaskContract,
  validateTaskContract,
  getFilePrerequisites,
  getDirPrerequisites,
  getEnvPrerequisites,
  getPolicyPrerequisites,
  requiresContextAck,
  getEvidenceArtifacts,
  getValidateCommands,
  getAuditToolIds,
  getGateIds,
  getContractValidationSummary,
} from './contract-parser.js';

describe('parseTag', () => {
  it('parses valid FILE: tag', () => {
    const tag = parseTag('FILE:packages/db/prisma/schema.prisma');
    expect(tag).toEqual({
      type: 'FILE',
      value: 'packages/db/prisma/schema.prisma',
      raw: 'FILE:packages/db/prisma/schema.prisma',
    });
  });

  it('parses valid DIR: tag', () => {
    const tag = parseTag('DIR:tests/integration');
    expect(tag).toEqual({
      type: 'DIR',
      value: 'tests/integration',
      raw: 'DIR:tests/integration',
    });
  });

  it('parses valid ENV: tag', () => {
    const tag = parseTag('ENV:SUPABASE_URL');
    expect(tag).toEqual({
      type: 'ENV',
      value: 'SUPABASE_URL',
      raw: 'ENV:SUPABASE_URL',
    });
  });

  it('parses valid POLICY: tag', () => {
    const tag = parseTag('POLICY:zero-trust-db-access');
    expect(tag).toEqual({
      type: 'POLICY',
      value: 'zero-trust-db-access',
      raw: 'POLICY:zero-trust-db-access',
    });
  });

  it('parses valid EVIDENCE: tag', () => {
    const tag = parseTag('EVIDENCE:context_ack');
    expect(tag).toEqual({
      type: 'EVIDENCE',
      value: 'context_ack',
      raw: 'EVIDENCE:context_ack',
    });
  });

  it('parses valid VALIDATE: tag', () => {
    const tag = parseTag('VALIDATE:pnpm test:integration');
    expect(tag).toEqual({
      type: 'VALIDATE',
      value: 'pnpm test:integration',
      raw: 'VALIDATE:pnpm test:integration',
    });
  });

  it('parses valid AUDIT: tag', () => {
    const tag = parseTag('AUDIT:db-schema-drift');
    expect(tag).toEqual({
      type: 'AUDIT',
      value: 'db-schema-drift',
      raw: 'AUDIT:db-schema-drift',
    });
  });

  it('parses valid GATE: tag', () => {
    const tag = parseTag('GATE:supabase-healthcheck');
    expect(tag).toEqual({
      type: 'GATE',
      value: 'supabase-healthcheck',
      raw: 'GATE:supabase-healthcheck',
    });
  });

  it('returns null for invalid tag type', () => {
    const tag = parseTag('INVALID:some-value');
    expect(tag).toBeNull();
  });

  it('returns null for no colon', () => {
    const tag = parseTag('just-a-string');
    expect(tag).toBeNull();
  });

  it('returns null for empty value', () => {
    const tag = parseTag('FILE:');
    expect(tag).toBeNull();
  });

  it('trims whitespace from input', () => {
    const tag = parseTag('  FILE:path/to/file.ts  ');
    expect(tag).toEqual({
      type: 'FILE',
      value: 'path/to/file.ts',
      raw: 'FILE:path/to/file.ts',
    });
  });

  it('handles lowercase tag type by converting to uppercase', () => {
    const tag = parseTag('file:path/to/file.ts');
    // Our regex requires uppercase, so this should return null
    expect(tag).toBeNull();
  });
});

describe('parseTagList', () => {
  it('parses semicolon-separated tags', () => {
    const tags = parseTagList('FILE:a.ts;DIR:src;ENV:API_KEY');
    expect(tags).toHaveLength(3);
    expect(tags[0]?.type).toBe('FILE');
    expect(tags[1]?.type).toBe('DIR');
    expect(tags[2]?.type).toBe('ENV');
  });

  it('returns empty array for empty string', () => {
    expect(parseTagList('')).toEqual([]);
  });

  it('returns empty array for null/undefined', () => {
    expect(parseTagList(null as unknown as string)).toEqual([]);
    expect(parseTagList(undefined as unknown as string)).toEqual([]);
  });

  it('skips invalid tags in list', () => {
    const tags = parseTagList('FILE:a.ts;invalid;ENV:KEY');
    expect(tags).toHaveLength(2);
  });
});

describe('containsEllipsis', () => {
  it('returns true for string with ...', () => {
    expect(containsEllipsis('FILE:path/...')).toBe(true);
    expect(containsEllipsis('Something ... else')).toBe(true);
    expect(containsEllipsis('...')).toBe(true);
  });

  it('returns false for string without ...', () => {
    expect(containsEllipsis('FILE:path/to/file.ts')).toBe(false);
    expect(containsEllipsis('')).toBe(false);
    expect(containsEllipsis('a..b')).toBe(false);
    expect(containsEllipsis('..')).toBe(false);
  });
});

describe('parseTaskContract', () => {
  it('parses all contract fields', () => {
    const contract = parseTaskContract(
      'FILE:schema.prisma;ENV:DB_URL;POLICY:zero-trust',
      'EVIDENCE:context_ack;EVIDENCE:test_output',
      'VALIDATE:pnpm test;GATE:healthcheck;AUDIT:security'
    );

    expect(contract.prerequisites).toHaveLength(3);
    expect(contract.artifacts).toHaveLength(2);
    expect(contract.validations).toHaveLength(3);
    expect(contract.errors).toHaveLength(0);
    expect(contract.hasEllipsis).toBe(false);
  });

  it('detects ellipsis in prerequisites', () => {
    const contract = parseTaskContract('FILE:path/to/...', 'EVIDENCE:output', 'VALIDATE:test');

    expect(contract.hasEllipsis).toBe(true);
    expect(contract.errors).toHaveLength(1);
    expect(contract.errors[0]?.field).toBe('Pre-requisites');
    expect(contract.errors[0]?.message).toContain('NOELLIPSIS');
  });

  it('detects ellipsis in artifacts', () => {
    const contract = parseTaskContract('FILE:valid', 'EVIDENCE:...', 'VALIDATE:test');

    expect(contract.hasEllipsis).toBe(true);
    expect(contract.errors.some((e) => e.field === 'Artifacts To Track')).toBe(true);
  });

  it('detects ellipsis in validation method', () => {
    const contract = parseTaskContract('FILE:valid', 'EVIDENCE:output', 'VALIDATE:...');

    expect(contract.hasEllipsis).toBe(true);
    expect(contract.errors.some((e) => e.field === 'Validation Method')).toBe(true);
  });

  it('handles empty fields', () => {
    const contract = parseTaskContract('', '', '');

    expect(contract.prerequisites).toHaveLength(0);
    expect(contract.artifacts).toHaveLength(0);
    expect(contract.validations).toHaveLength(0);
    expect(contract.errors).toHaveLength(0);
  });
});

describe('validateTaskContract', () => {
  it('returns valid for correct contract', () => {
    const result = validateTaskContract(
      'IFC-006',
      'FILE:schema.prisma',
      'EVIDENCE:context_ack',
      'VALIDATE:test'
    );

    expect(result.valid).toBe(true);
    expect(result.severity).toBe('PASS');
    expect(result.taskId).toBe('IFC-006');
  });

  it('returns invalid for contract with ellipsis', () => {
    const result = validateTaskContract('IFC-007', 'FILE:...', 'EVIDENCE:output', 'VALIDATE:test');

    expect(result.valid).toBe(false);
    expect(result.taskId).toBe('IFC-007');
  });
});

describe('contract extraction utilities', () => {
  const contract = parseTaskContract(
    'FILE:a.ts;FILE:b.ts;DIR:src;ENV:KEY;POLICY:rule',
    'EVIDENCE:ack;EVIDENCE:log',
    'VALIDATE:cmd;AUDIT:tool;GATE:check'
  );

  it('getFilePrerequisites returns FILE: values', () => {
    expect(getFilePrerequisites(contract)).toEqual(['a.ts', 'b.ts']);
  });

  it('getDirPrerequisites returns DIR: values', () => {
    expect(getDirPrerequisites(contract)).toEqual(['src']);
  });

  it('getEnvPrerequisites returns ENV: values', () => {
    expect(getEnvPrerequisites(contract)).toEqual(['KEY']);
  });

  it('getPolicyPrerequisites returns POLICY: values', () => {
    expect(getPolicyPrerequisites(contract)).toEqual(['rule']);
  });

  it('getEvidenceArtifacts returns EVIDENCE: values', () => {
    expect(getEvidenceArtifacts(contract)).toEqual(['ack', 'log']);
  });

  it('getValidateCommands returns VALIDATE: values', () => {
    expect(getValidateCommands(contract)).toEqual(['cmd']);
  });

  it('getAuditToolIds returns AUDIT: values', () => {
    expect(getAuditToolIds(contract)).toEqual(['tool']);
  });

  it('getGateIds returns GATE: values', () => {
    expect(getGateIds(contract)).toEqual(['check']);
  });
});

describe('requiresContextAck', () => {
  it('returns true when EVIDENCE:context_ack is present', () => {
    const contract = parseTaskContract('', 'EVIDENCE:context_ack', '');
    expect(requiresContextAck(contract)).toBe(true);
  });

  it('returns false when EVIDENCE:context_ack is not present', () => {
    const contract = parseTaskContract('', 'EVIDENCE:other', '');
    expect(requiresContextAck(contract)).toBe(false);
  });

  it('returns false for empty artifacts', () => {
    const contract = parseTaskContract('', '', '');
    expect(requiresContextAck(contract)).toBe(false);
  });
});

describe('getContractValidationSummary', () => {
  it('calculates correct summary statistics', () => {
    const results = [
      validateTaskContract('T1', 'FILE:a', 'EVIDENCE:context_ack', 'VALIDATE:x'),
      validateTaskContract('T2', 'FILE:...', '', ''),
      validateTaskContract('T3', '', 'EVIDENCE:context_ack', ''),
    ];

    const summary = getContractValidationSummary(results);

    expect(summary.total).toBe(3);
    expect(summary.valid).toBe(2);
    expect(summary.invalid).toBe(1);
    expect(summary.withEllipsis).toBe(1);
    expect(summary.requireContextAck).toBe(2);
  });
});
