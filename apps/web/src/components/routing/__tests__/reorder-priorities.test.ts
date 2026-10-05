import { describe, it, expect } from 'vitest';
import { prioritiesForOrder } from '../reorder-priorities';

describe('prioritiesForOrder', () => {
  it('gives the top row the highest priority and the last row the lowest', () => {
    const writes = prioritiesForOrder([
      { id: 'a', priority: 0 },
      { id: 'b', priority: 1 },
      { id: 'c', priority: 2 },
    ]);

    expect(writes).toEqual([
      { id: 'a', priority: 2 },
      { id: 'b', priority: 1 },
      { id: 'c', priority: 0 },
    ]);
  });

  it('stays inside the range the rows already occupied (partial page of rules)', () => {
    const writes = prioritiesForOrder([
      { id: 'x', priority: 12 },
      { id: 'y', priority: 11 },
      { id: 'z', priority: 10 },
    ]);

    expect(writes.map((w) => w.priority)).toEqual([12, 11, 10]);
  });

  it('breaks ties between rows that shared a priority', () => {
    const writes = prioritiesForOrder([
      { id: 'a', priority: 0 },
      { id: 'b', priority: 0 },
    ]);

    expect(writes).toEqual([
      { id: 'a', priority: 1 },
      { id: 'b', priority: 0 },
    ]);
  });

  it('returns nothing for an empty list', () => {
    expect(prioritiesForOrder([])).toEqual([]);
  });
});
