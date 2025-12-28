/**
 * Unit tests for context-ack-gatekeeper.ts
 *
 * @module tools/scripts/lib/context-ack-gatekeeper.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateContextAckStructure,
  validateFilePrerequisites,
  CONTEXT_ACK_SCHEMA,
  type ContextAck,
} from './context-ack-gatekeeper.js';
import type { ContextPackManifest } from './context-pack-builder.js';

describe('validateContextAckStructure', () => {
  it('validates correct ack structure', () => {
    const ack: ContextAck = {
      task_id: 'IFC-006',
      run_id: '20251225-143022-IFC-006-a3f7',
      files_read: [
        {
          path: 'schema.prisma',
          sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
        },
      ],
      invariants_acknowledged: [
        'Zero trust security',
        'Type safety required',
        'Tests must pass',
        'Coverage >90%',
        'No runtime artifacts in docs',
      ],
      created_at: '2025-12-25T14:30:22Z',
    };

    const errors = validateContextAckStructure(ack);
    expect(errors).toHaveLength(0);
  });

  it('rejects null ack', () => {
    const errors = validateContextAckStructure(null);
    expect(errors).toContain('context_ack.json is not a valid JSON object');
  });

  it('rejects undefined ack', () => {
    const errors = validateContextAckStructure(undefined);
    expect(errors).toContain('context_ack.json is not a valid JSON object');
  });

  it('rejects missing task_id', () => {
    const ack = {
      run_id: 'run-123',
      files_read: [],
      invariants_acknowledged: ['1', '2', '3', '4', '5'],
    };

    const errors = validateContextAckStructure(ack);
    expect(errors.some((e) => e.includes('task_id'))).toBe(true);
  });

  it('rejects empty task_id', () => {
    const ack = {
      task_id: '  ',
      run_id: 'run-123',
      files_read: [],
      invariants_acknowledged: ['1', '2', '3', '4', '5'],
    };

    const errors = validateContextAckStructure(ack);
    expect(errors.some((e) => e.includes('task_id'))).toBe(true);
  });

  it('rejects missing run_id', () => {
    const ack = {
      task_id: 'IFC-006',
      files_read: [],
      invariants_acknowledged: ['1', '2', '3', '4', '5'],
    };

    const errors = validateContextAckStructure(ack);
    expect(errors.some((e) => e.includes('run_id'))).toBe(true);
  });

  it('rejects missing files_read', () => {
    const ack = {
      task_id: 'IFC-006',
      run_id: 'run-123',
      invariants_acknowledged: ['1', '2', '3', '4', '5'],
    };

    const errors = validateContextAckStructure(ack);
    expect(errors.some((e) => e.includes('files_read'))).toBe(true);
  });

  it('rejects files_read entry without path', () => {
    const ack = {
      task_id: 'IFC-006',
      run_id: 'run-123',
      files_read: [{ sha256: 'abc123' }],
      invariants_acknowledged: ['1', '2', '3', '4', '5'],
    };

    const errors = validateContextAckStructure(ack);
    expect(errors.some((e) => e.includes('path'))).toBe(true);
  });

  it('rejects files_read entry without sha256', () => {
    const ack = {
      task_id: 'IFC-006',
      run_id: 'run-123',
      files_read: [{ path: 'file.ts' }],
      invariants_acknowledged: ['1', '2', '3', '4', '5'],
    };

    const errors = validateContextAckStructure(ack);
    expect(errors.some((e) => e.includes('sha256'))).toBe(true);
  });

  it('rejects fewer than 5 invariants', () => {
    const ack = {
      task_id: 'IFC-006',
      run_id: 'run-123',
      files_read: [],
      invariants_acknowledged: ['1', '2', '3', '4'],
    };

    const errors = validateContextAckStructure(ack);
    expect(errors.some((e) => e.includes('at least 5'))).toBe(true);
  });

  it('requires 5 non-empty invariants', () => {
    const ack = {
      task_id: 'IFC-006',
      run_id: 'run-123',
      files_read: [],
      invariants_acknowledged: ['1', '2', '', '3', '  ', '4'],
    };

    const errors = validateContextAckStructure(ack);
    expect(errors.some((e) => e.includes('at least 5'))).toBe(true);
  });
});

describe('validateFilePrerequisites', () => {
  const createAck = (files: Array<{ path: string; sha256: string }>): ContextAck => ({
    task_id: 'TEST',
    run_id: 'test-run',
    files_read: files,
    invariants_acknowledged: ['1', '2', '3', '4', '5'],
    created_at: '2025-01-01',
  });

  const createManifest = (
    files: Array<{ path: string; sha256: string; included: boolean }>
  ): ContextPackManifest => ({
    taskId: 'TEST',
    runId: 'test-run',
    createdAt: '2025-01-01',
    repoRoot: '/repo',
    files: files.map((f) => ({
      ...f,
      totalLines: 100,
      excerptLines: 100,
      truncated: false,
    })),
    totalSizeBytes: 1000,
    truncatedDueToSize: false,
  });

  it('passes when all manifest files are acknowledged with matching hashes', () => {
    const ack = createAck([
      { path: 'file1.ts', sha256: 'hash1' },
      { path: 'file2.ts', sha256: 'hash2' },
    ]);

    const manifest = createManifest([
      { path: 'file1.ts', sha256: 'hash1', included: true },
      { path: 'file2.ts', sha256: 'hash2', included: true },
    ]);

    const result = validateFilePrerequisites(ack, manifest, ['file1.ts', 'file2.ts']);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('reports error for missing acknowledgement', () => {
    const ack = createAck([{ path: 'file1.ts', sha256: 'hash1' }]);

    const manifest = createManifest([
      { path: 'file1.ts', sha256: 'hash1', included: true },
      { path: 'file2.ts', sha256: 'hash2', included: true },
    ]);

    const result = validateFilePrerequisites(ack, manifest, ['file1.ts', 'file2.ts']);

    expect(result.errors.some((e) => e.includes('file2.ts'))).toBe(true);
  });

  it('reports error for SHA256 mismatch', () => {
    const ack = createAck([{ path: 'file1.ts', sha256: 'wrong-hash' }]);

    const manifest = createManifest([{ path: 'file1.ts', sha256: 'correct-hash', included: true }]);

    const result = validateFilePrerequisites(ack, manifest, ['file1.ts']);

    expect(result.errors.some((e) => e.includes('SHA256 mismatch'))).toBe(true);
  });

  it('reports warning for extra acknowledged files', () => {
    const ack = createAck([
      { path: 'file1.ts', sha256: 'hash1' },
      { path: 'extra.ts', sha256: 'hashX' },
    ]);

    const manifest = createManifest([{ path: 'file1.ts', sha256: 'hash1', included: true }]);

    const result = validateFilePrerequisites(ack, manifest, ['file1.ts']);

    expect(result.warnings.some((w) => w.includes('extra.ts'))).toBe(true);
  });

  it('ignores non-included manifest files', () => {
    const ack = createAck([{ path: 'file1.ts', sha256: 'hash1' }]);

    const manifest = createManifest([
      { path: 'file1.ts', sha256: 'hash1', included: true },
      { path: 'excluded.ts', sha256: 'hashX', included: false },
    ]);

    const result = validateFilePrerequisites(ack, manifest, ['file1.ts', 'excluded.ts']);

    expect(result.errors).toHaveLength(0);
  });

  it('normalizes path separators', () => {
    const ack = createAck([{ path: 'src/file.ts', sha256: 'hash1' }]);

    const manifest = createManifest([{ path: 'src/file.ts', sha256: 'hash1', included: true }]);

    const result = validateFilePrerequisites(ack, manifest, ['src\\file.ts']);

    expect(result.errors).toHaveLength(0);
  });
});

describe('CONTEXT_ACK_SCHEMA', () => {
  it('has required fields defined', () => {
    expect(CONTEXT_ACK_SCHEMA.required).toContain('task_id');
    expect(CONTEXT_ACK_SCHEMA.required).toContain('run_id');
    expect(CONTEXT_ACK_SCHEMA.required).toContain('files_read');
    expect(CONTEXT_ACK_SCHEMA.required).toContain('invariants_acknowledged');
  });

  it('defines minItems for invariants_acknowledged', () => {
    const schema = CONTEXT_ACK_SCHEMA as Record<string, any>;
    expect(schema.properties.invariants_acknowledged.minItems).toBe(5);
  });

  it('is valid JSON schema structure', () => {
    expect(CONTEXT_ACK_SCHEMA.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(CONTEXT_ACK_SCHEMA.type).toBe('object');
    expect(CONTEXT_ACK_SCHEMA.properties).toBeDefined();
  });
});
