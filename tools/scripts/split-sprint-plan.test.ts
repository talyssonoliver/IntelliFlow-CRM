import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  source: '',
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: fsMock.readFileSync,
  writeFileSync: fsMock.writeFileSync,
  existsSync: fsMock.existsSync,
  unlinkSync: fsMock.unlinkSync,
}));

import { splitSprintPlan } from './split-sprint-plan';

const HEADER = 'Task ID,Description';
const row = (id: number, size: number) => `T-${id},${'x'.repeat(size)}`;
const csv = (rows: string[]) => [HEADER, ...rows].join('\n') + '\n';

describe('splitSprintPlan', () => {
  const written = new Map<string, string>();

  beforeEach(() => {
    written.clear();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fsMock.existsSync.mockReturnValue(true);
    fsMock.writeFileSync.mockImplementation((path: string, content: string) => {
      written.set(path, content);
    });
    fsMock.readFileSync.mockImplementation((path: string) => written.get(path) ?? fsMock.source);
  });

  it('keeps a small plan in one part with the header', () => {
    fsMock.source = csv([row(1, 10), row(2, 10)]);
    const result = splitSprintPlan();

    expect(result.success).toBe(true);
    expect(result.sourceRows).toBe(2);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toMatchObject({ name: 'A', rows: 2, startRow: 1, endRow: 2 });
    expect([...written.values()][0].startsWith(HEADER + '\n')).toBe(true);
  });

  it('starts a new part when the next row would pass the size limit', () => {
    fsMock.source = csv([row(1, 40000), row(2, 40000), row(3, 40000)]);
    const result = splitSprintPlan();

    expect(result.success).toBe(true);
    expect(result.parts.map((p) => [p.name, p.rows, p.startRow, p.endRow])).toEqual([
      ['A', 1, 1, 1],
      ['B', 1, 2, 2],
      ['C', 1, 3, 3],
    ]);
  });

  it('can use the eleventh part, K', () => {
    fsMock.source = csv(Array.from({ length: 11 }, (_, i) => row(i, 70000)));
    const result = splitSprintPlan();

    expect(result.success).toBe(true);
    expect(result.parts).toHaveLength(11);
    expect(result.parts[10].name).toBe('K');
  });

  it('fails with a clear error when more than eleven parts are needed', () => {
    fsMock.source = csv(Array.from({ length: 12 }, (_, i) => row(i, 70000)));
    const result = splitSprintPlan();

    expect(result.success).toBe(false);
    expect(result.error).toContain('File too large: needs more than 11 parts');
  });

  it('removes part files that a smaller plan no longer needs', () => {
    fsMock.source = csv([row(1, 10)]);
    splitSprintPlan();

    expect(fsMock.unlinkSync).toHaveBeenCalledTimes(10);
  });

  it('does not delete part files that do not exist', () => {
    fsMock.source = csv([row(1, 10)]);
    fsMock.existsSync.mockImplementation((path: string) => path.endsWith('Sprint_plan.csv'));
    splitSprintPlan();

    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
  });

  it('reports a read failure instead of throwing', () => {
    fsMock.readFileSync.mockImplementation(() => {
      throw new Error('boom');
    });
    const result = splitSprintPlan();

    expect(result).toMatchObject({ success: false, sourceRows: 0, error: 'boom' });
  });
});
