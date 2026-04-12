/**
 * Unit tests for context-pack-builder.ts
 *
 * @module tools/scripts/lib/context-pack-builder.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeSha256, generateFileExcerpt, generateRunId } from './context-pack-builder.js';
import { vol } from 'memfs';

// Mock fs module
vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

describe('computeSha256', () => {
  it('computes SHA256 hash of string', () => {
    const hash = computeSha256('hello world');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('computes SHA256 hash of empty string', () => {
    const hash = computeSha256('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('computes SHA256 hash of Buffer', () => {
    const hash = computeSha256(Buffer.from('hello world'));
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });
});

describe('generateRunId', () => {
  it('generates run ID with correct format', () => {
    const runId = generateRunId('IFC-006');

    // Format: YYYYMMDD-HHMMSS-<task_id>-<random_4_hex>
    const pattern = /^\d{8}-\d{6}-IFC-006-[a-f0-9]{4}$/;
    expect(runId).toMatch(pattern);
  });

  it('generates unique run IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ids.add(generateRunId('TEST-001'));
    }
    // All IDs should be unique (high probability with random suffix)
    expect(ids.size).toBe(10);
  });

  it('includes task ID in run ID', () => {
    const runId = generateRunId('MY-TASK-123');
    expect(runId).toContain('MY-TASK-123');
  });
});

describe('generateFileExcerpt', () => {
  beforeEach(() => {
    // Reset the virtual filesystem
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
  });

  it('returns error for non-existent file', () => {
    const excerpt = generateFileExcerpt('/nonexistent/file.ts', '/repo');

    expect(excerpt.error).toContain('File not found');
    expect(excerpt.content).toBe('');
    expect(excerpt.sha256).toBe('');
  });

  it('reads entire file when under 120 lines', () => {
    const content = Array(50).fill('line').join('\n');
    vol.fromJSON({
      '/repo/small.ts': content,
    });

    const excerpt = generateFileExcerpt('/repo/small.ts', '/repo');

    expect(excerpt.truncated).toBe(false);
    expect(excerpt.totalLines).toBe(50);
    expect(excerpt.excerptLines).toBe(50);
    expect(excerpt.content).toBe(content);
    expect(excerpt.sha256).toHaveLength(64);
  });

  it('truncates file when over 120 lines', () => {
    const lines = Array(200)
      .fill(0)
      .map((_, i) => `line ${i + 1}`);
    const content = lines.join('\n');
    vol.fromJSON({
      '/repo/large.ts': content,
    });

    const excerpt = generateFileExcerpt('/repo/large.ts', '/repo');

    expect(excerpt.truncated).toBe(true);
    expect(excerpt.totalLines).toBe(200);
    expect(excerpt.excerptLines).toBe(120);
    expect(excerpt.content).toContain('[... 80 lines omitted ...]');
    expect(excerpt.content).toContain('line 1');
    expect(excerpt.content).toContain('line 60');
    expect(excerpt.content).toContain('line 141');
    expect(excerpt.content).toContain('line 200');
  });

  it('normalizes relative path with forward slashes', () => {
    vol.fromJSON({
      '/repo/src/file.ts': 'content',
    });

    const excerpt = generateFileExcerpt('/repo/src/file.ts', '/repo');

    expect(excerpt.relativePath).toBe('src/file.ts');
    expect(excerpt.relativePath).not.toContain('\\');
  });
});
