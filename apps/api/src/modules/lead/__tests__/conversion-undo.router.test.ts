/**
 * leadConversion router (MVP-003): status and undo, tenant-scoped, errors mapped to tRPC codes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createTestContext, TEST_UUIDS } from '../../../test/setup';

const fake = vi.hoisted(() => ({
  check: vi.fn(),
  execute: vi.fn(),
  ctorArgs: [] as unknown[],
}));

vi.mock('@intelliflow/application', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/application')>()),
  UndoLeadConversionUseCase: vi.fn(function (this: unknown, ...args: unknown[]) {
    fake.ctorArgs = args;
    return { check: fake.check, execute: fake.execute };
  }),
}));

vi.mock('@intelliflow/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/adapters')>()),
  PrismaConversionUndoAdapter: vi.fn(function () {
    return { kind: 'undo-adapter' };
  }),
}));

import { conversionUndoRouter } from '../conversion-undo.router';

const adapters = {
  leadRepository: { kind: 'leads' },
  eventBus: { kind: 'events' },
  transactionManager: { kind: 'tx' },
};

function caller(withContainer = true) {
  const ctx = createTestContext();
  (ctx as { container?: unknown }).container = withContainer ? { adapters } : undefined;
  return conversionUndoRouter.createCaller(ctx);
}

const ok = <T>(value: T) => ({ isSuccess: true, isFailure: false, value });
const fail = (message: string) => ({
  isSuccess: false,
  isFailure: true,
  error: new Error(message),
});
const input = { opportunityId: TEST_UUIDS.opportunity1 };

describe('leadConversion router (MVP-003)', () => {
  beforeEach(() => {
    fake.check.mockReset();
    fake.execute.mockReset();
  });

  it('status: returns whether the deal can be undone, for the caller tenant', async () => {
    fake.check.mockResolvedValue(ok({ canUndo: true, leadId: TEST_UUIDS.lead1, reasons: [] }));
    const result = await caller().status(input);
    expect(result).toEqual({ canUndo: true, leadId: TEST_UUIDS.lead1, reasons: [] });
    expect(fake.check).toHaveBeenCalledWith({
      opportunityId: TEST_UUIDS.opportunity1,
      tenantId: expect.any(String),
    });
    expect(fake.ctorArgs).toEqual([
      adapters.leadRepository,
      { kind: 'undo-adapter' },
      adapters.eventBus,
      adapters.transactionManager,
    ]);
  });

  it('undo: passes who undid it and returns the lead', async () => {
    fake.execute.mockResolvedValue(ok({ leadId: TEST_UUIDS.lead1 }));
    expect(await caller().undo(input)).toEqual({ leadId: TEST_UUIDS.lead1 });
    expect(fake.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: TEST_UUIDS.opportunity1,
        undoneBy: expect.any(String),
      })
    );
  });

  it.each([
    ['Deal not found: x', 'NOT_FOUND'],
    ['This conversion can no longer be undone: the deal has tasks.', 'BAD_REQUEST'],
    ['Failed to undo the conversion: lock timeout', 'INTERNAL_SERVER_ERROR'],
  ])('maps %j to %s', async (message, code) => {
    fake.execute.mockResolvedValue(fail(message));
    const error = await caller()
      .undo(input)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe(code);
  });

  it('hides the internal detail of a failed write', async () => {
    fake.execute.mockResolvedValue(fail('Failed to undo the conversion: lock timeout'));
    await expect(caller().undo(input)).rejects.toThrow(
      'The conversion could not be undone. Try again.'
    );
  });

  it('status errors are mapped too', async () => {
    fake.check.mockResolvedValue(fail('Deal not found: x'));
    await expect(caller().status(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('fails cleanly when the service is not wired', async () => {
    await expect(caller(false).status(input)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('rejects an empty deal id', async () => {
    await expect(caller().undo({ opportunityId: '' })).rejects.toThrow();
  });
});
