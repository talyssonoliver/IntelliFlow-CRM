/**
 * IFC-151: the DLQ triage CLI (tools/scripts/outbox-dlq.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { parseArgs, run, isPoison, type DlqRepository } from '../outbox-dlq';

const entry = (id: string, lastError: string) => ({
  id,
  eventType: 'lead.created',
  aggregateType: 'Lead',
  tenantId: 't-1',
  retryCount: 3,
  lastError,
  occurredAt: new Date('2026-11-12T10:00:00Z'),
});

function fakeRepo(letters = [entry('e1', 'down'), entry('e2', 'poison: no leadId')]) {
  const requeued: string[] = [];
  const repo: DlqRepository = {
    listDeadLetters: vi.fn(async () => letters),
    requeueDeadLetter: vi.fn(async (id: string) => {
      if (id === 'gone') return false;
      requeued.push(id);
      return true;
    }),
  };
  return { repo, requeued };
}

describe('parseArgs', () => {
  it('parses list with filters', () => {
    expect(
      parseArgs(['list', '--type', 'lead.created', '--tenant', 't-1', '--limit', '10'])
    ).toEqual({
      command: 'list',
      type: 'lead.created',
      tenant: 't-1',
      limit: 10,
      ids: [],
      includePoison: false,
      apply: false,
    });
  });

  it('parses replay with ids, poison and apply', () => {
    expect(
      parseArgs(['replay', '--id', 'a', '--id', 'b', '--include-poison', '--apply'])
    ).toMatchObject({
      command: 'replay',
      ids: ['a', 'b'],
      includePoison: true,
      apply: true,
    });
  });

  it.each([
    [[], 'usage'],
    [['drop'], 'usage'],
    [['list', '--apply'], 'list is read-only'],
    [['list', '--id', 'x'], 'list is read-only'],
    [['replay', '--type'], '--type needs a value'],
    [['replay', '--id', '--apply'], '--id needs a value'],
    [['replay', '--limit', '0'], '--limit must be a positive integer'],
    [['replay', '--force'], 'unknown option --force'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe('run', () => {
  it('list prints every dead letter and marks poison', async () => {
    const { repo } = fakeRepo();
    const lines: string[] = [];
    expect(
      await run(repo, parseArgs(['list', '--type', 'lead.created']), (l) => lines.push(l))
    ).toBe(2);
    expect(repo.listDeadLetters).toHaveBeenCalledWith({
      limit: 50,
      eventType: 'lead.created',
      tenantId: undefined,
    });
    expect(lines[0]).toBe('[outbox-dlq] 2 dead letter(s)');
    expect(lines[2]).toContain('POISON poison: no leadId');
    expect(repo.requeueDeadLetter).not.toHaveBeenCalled();
  });

  it('replay is a dry run by default and skips poison', async () => {
    const { repo } = fakeRepo();
    const lines: string[] = [];
    expect(await run(repo, parseArgs(['replay']), (l) => lines.push(l))).toBe(0);
    expect(repo.requeueDeadLetter).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('skip e2: poison message');
    expect(lines.join('\n')).toContain('mode=DRY-RUN selected=2 replay=1 poisonSkipped=1');
    expect(lines.join('\n')).toContain('would requeue e1');
  });

  it('replay --apply requeues the non-poison letters', async () => {
    const { repo, requeued } = fakeRepo();
    expect(await run(repo, parseArgs(['replay', '--apply']), () => {})).toBe(1);
    expect(requeued).toEqual(['e1']);
  });

  it('replay --include-poison --apply requeues both', async () => {
    const { repo, requeued } = fakeRepo();
    expect(await run(repo, parseArgs(['replay', '--include-poison', '--apply']), () => {})).toBe(2);
    expect(requeued).toEqual(['e1', 'e2']);
  });

  it('replay --id picks ids and reports ones that are not dead letters', async () => {
    const { repo, requeued } = fakeRepo([entry('e1', 'down'), entry('gone', 'down')]);
    const lines: string[] = [];
    await run(repo, parseArgs(['replay', '--id', 'gone', '--id', 'nope', '--apply']), (l) =>
      lines.push(l)
    );
    expect(requeued).toEqual([]);
    expect(lines.join('\n')).toContain('skip nope: not a dead letter in this selection');
    expect(lines.join('\n')).toContain('skip gone: no longer a dead letter');
    expect(lines.join('\n')).toContain('requeued 0 of 1');
  });

  it('isPoison reads the lastError prefix', () => {
    expect(isPoison(entry('x', 'poison: bad'))).toBe(true);
    expect(isPoison({ ...entry('x', ''), lastError: null })).toBe(false);
  });
});
