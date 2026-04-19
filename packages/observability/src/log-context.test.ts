/**
 * Tests for AsyncLocalStorage-based log context
 */

import { describe, it, expect } from 'vitest';
import { runWithLogContext, getCurrentLogContext } from './log-context';

describe('log-context', () => {
  it('returns null outside a runWithLogContext scope', () => {
    expect(getCurrentLogContext()).toBeNull();
  });

  it('returns the bound context inside runWithLogContext', () => {
    const ctx = { correlationId: 'corr-1', tenantId: 'tenant-1', userId: 'user-1' };

    runWithLogContext(ctx, () => {
      expect(getCurrentLogContext()).toEqual(ctx);
    });
  });

  it('returns null after the runWithLogContext scope exits', () => {
    runWithLogContext({ correlationId: 'corr-2' }, () => {
      // inside scope
    });

    expect(getCurrentLogContext()).toBeNull();
  });

  it('propagates context through async callbacks', async () => {
    const ctx = { correlationId: 'async-corr', tenantId: 'async-tenant' };

    await runWithLogContext(ctx, async () => {
      await Promise.resolve();
      expect(getCurrentLogContext()).toEqual(ctx);
    });
  });

  it('nests contexts correctly — inner scope wins', () => {
    const outer = { correlationId: 'outer', tenantId: 'outer-tenant' };
    const inner = { correlationId: 'inner', tenantId: 'inner-tenant' };

    runWithLogContext(outer, () => {
      expect(getCurrentLogContext()).toEqual(outer);

      runWithLogContext(inner, () => {
        expect(getCurrentLogContext()).toEqual(inner);
      });

      // Outer scope restored after inner exits
      expect(getCurrentLogContext()).toEqual(outer);
    });
  });

  it('returns the return value of the fn', () => {
    const result = runWithLogContext({ correlationId: 'ret-test' }, () => 42);
    expect(result).toBe(42);
  });
});
