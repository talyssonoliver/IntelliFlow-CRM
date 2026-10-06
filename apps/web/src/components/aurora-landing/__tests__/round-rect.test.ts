import { describe, it, expect, vi } from 'vitest';
import { roundedRect } from '../round-rect';

describe('roundedRect', () => {
  const ctx = () => ({ moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn() });

  it('traces the four rounded corners with arcs, without roundRect', () => {
    const g = ctx();
    roundedRect(g as unknown as CanvasRenderingContext2D, 10, 20, 100, 60, 12);
    expect(g.moveTo).toHaveBeenCalledWith(22, 20);
    expect(g.arcTo).toHaveBeenCalledTimes(4);
    expect(g.arcTo).toHaveBeenNthCalledWith(1, 110, 20, 110, 80, 12);
    expect(g.closePath).toHaveBeenCalled();
  });

  it('never lets the radius exceed half the shorter side', () => {
    const g = ctx();
    roundedRect(g as unknown as CanvasRenderingContext2D, 0, 0, 40, 20, 99);
    expect(g.arcTo.mock.calls.every((c) => c[4] === 10)).toBe(true);
  });
});
