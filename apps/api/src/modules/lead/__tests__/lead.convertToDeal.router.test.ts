/**
 * Lead ConvertToDeal Router Tests (IFC-062)
 *
 * Tests for the lead.convertToDeal tRPC mutation endpoint.
 * Validates input validation, error mapping, and output shape.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { leadRouter } from '../lead.router';
import { createTestContext, TEST_UUIDS } from '../../../test/setup';

describe('lead.convertToDeal router', () => {
  const validInput = {
    leadId: TEST_UUIDS.lead1,
    dealValue: 50000,
    dealName: 'Enterprise Deal',
    createContact: true,
  };

  const successOutput = {
    leadId: TEST_UUIDS.lead1,
    opportunityId: TEST_UUIDS.opportunity1,
    contactId: TEST_UUIDS.contact1,
    accountId: TEST_UUIDS.account1,
    stage: 'PROSPECTING',
    probability: 10,
    convertedBy: TEST_UUIDS.user1,
    convertedAt: new Date(),
    conversionSnapshot: { leadId: TEST_UUIDS.lead1, status: 'QUALIFIED' },
  };

  function createCtxWithUseCase(executeMock: ReturnType<typeof vi.fn>) {
    const ctx = createTestContext();
    // Create a new services object to avoid mutating shared mockServices
    ctx.services = {
      ...ctx.services,
      convertLeadToDeal: { execute: executeMock } as any,
    };
    return ctx;
  }

  // R1: should convert qualified lead and return full output shape (AC-001, AC-002, AC-003)
  it('should convert qualified lead and return full output shape', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      isFailure: false,
      isSuccess: true,
      value: successOutput,
    });
    const ctx = createCtxWithUseCase(executeMock);
    const caller = leadRouter.createCaller(ctx);

    const result = await caller.convertToDeal(validInput);

    expect(result.opportunityId).toBe(TEST_UUIDS.opportunity1);
    expect(result.stage).toBe('PROSPECTING');
    expect(result.probability).toBe(10);
    expect(result.leadId).toBe(TEST_UUIDS.lead1);
    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: TEST_UUIDS.lead1,
        dealValue: 50000,
      })
    );
  });

  // R2: should return NOT_FOUND when lead does not exist
  it('should return NOT_FOUND when lead does not exist', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      isFailure: true,
      isSuccess: false,
      error: { message: 'Lead not found with ID abc' },
    });
    const ctx = createCtxWithUseCase(executeMock);
    const caller = leadRouter.createCaller(ctx);

    await expect(caller.convertToDeal(validInput)).rejects.toThrow(TRPCError);
    await expect(caller.convertToDeal(validInput)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  // R3: should return BAD_REQUEST when lead is already converted (AC-009)
  it('should return BAD_REQUEST when lead is already converted', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      isFailure: true,
      isSuccess: false,
      error: { message: 'Lead already converted to a contact' },
    });
    const ctx = createCtxWithUseCase(executeMock);
    const caller = leadRouter.createCaller(ctx);

    await expect(caller.convertToDeal(validInput)).rejects.toThrow(TRPCError);
    await expect(caller.convertToDeal(validInput)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  // R4: should return BAD_REQUEST when dealValue is invalid
  it('should return BAD_REQUEST when dealValue is invalid', async () => {
    const ctx = createCtxWithUseCase(vi.fn());
    const caller = leadRouter.createCaller(ctx);

    // dealValue must be positive integer per schema
    await expect(
      caller.convertToDeal({ ...validInput, dealValue: -100 })
    ).rejects.toThrow();
  });

  // R5: should return BAD_REQUEST when no account is resolvable
  it('should return BAD_REQUEST when no account is resolvable', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      isFailure: true,
      isSuccess: false,
      error: { message: 'Account name is required when lead has no company' },
    });
    const ctx = createCtxWithUseCase(executeMock);
    const caller = leadRouter.createCaller(ctx);

    await expect(caller.convertToDeal(validInput)).rejects.toThrow(TRPCError);
    await expect(caller.convertToDeal(validInput)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  // R6: should return INTERNAL_SERVER_ERROR on persistence failure
  it('should return INTERNAL_SERVER_ERROR on persistence failure', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      isFailure: true,
      isSuccess: false,
      error: { message: 'Failed to save opportunity' },
    });
    const ctx = createCtxWithUseCase(executeMock);
    const caller = leadRouter.createCaller(ctx);

    await expect(caller.convertToDeal(validInput)).rejects.toThrow(TRPCError);
    await expect(caller.convertToDeal(validInput)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  // R7: should inject convertedBy from session, not client input (AC-010)
  it('should inject convertedBy from session, not client input', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      isFailure: false,
      isSuccess: true,
      value: successOutput,
    });
    const ctx = createCtxWithUseCase(executeMock);
    const caller = leadRouter.createCaller(ctx);

    await caller.convertToDeal(validInput);

    // convertedBy should come from session user, not from client input
    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        convertedBy: ctx.user!.userId,
      })
    );
  });

  // R8: should return output with opportunityId, contactId, accountId, stage, probability
  it('should return output with opportunityId, contactId, accountId, stage, probability', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      isFailure: false,
      isSuccess: true,
      value: successOutput,
    });
    const ctx = createCtxWithUseCase(executeMock);
    const caller = leadRouter.createCaller(ctx);

    const result = await caller.convertToDeal(validInput);

    expect(result).toHaveProperty('opportunityId');
    expect(result).toHaveProperty('contactId');
    expect(result).toHaveProperty('accountId');
    expect(result).toHaveProperty('stage');
    expect(result).toHaveProperty('probability');
    expect(result).toHaveProperty('conversionSnapshot');
  });
});
