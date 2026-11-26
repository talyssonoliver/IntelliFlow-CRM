/**
 * MVP-003: a lead converts to a deal without a value; the deal starts at £0 ("Add value").
 */
import { describe, it, expect, vi } from 'vitest';
import { Lead, type Opportunity } from '@intelliflow/domain';
import { ConvertLeadToDealUseCase } from '../ConvertLeadToDealUseCase';

function setup() {
  const lead = Lead.create({
    email: 'owner@pilates.example.invalid',
    company: 'Studio Pilates Demo',
    source: 'WEBSITE',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
  }).value;
  lead.qualify('owner-1', 'Wants a new website this quarter');
  lead.clearDomainEvents();

  const saved: { deal: Opportunity | null } = { deal: null };
  const useCase = new ConvertLeadToDealUseCase(
    { findById: vi.fn(async () => lead), save: vi.fn() } as never,
    { findByEmailInTenant: vi.fn(async () => null), save: vi.fn() } as never,
    { findByName: vi.fn(async () => []), save: vi.fn() } as never,
    { save: vi.fn(async (deal: Opportunity) => void (saved.deal = deal)) } as never,
    { publishAll: vi.fn() } as never,
    { run: (work: (tx: never) => Promise<unknown>) => work({} as never) } as never
  );
  return { lead, useCase, saved };
}

describe('ConvertLeadToDealUseCase without a deal value (MVP-003)', () => {
  it('creates the deal at £0 when no value is given', async () => {
    const { lead, useCase, saved } = setup();
    const result = await useCase.execute({ leadId: lead.id.value, convertedBy: 'owner-1' });
    expect(result.isSuccess).toBe(true);
    expect(saved.deal?.value.amount).toBe(0);
    expect(lead.status).toBe('CONVERTED');
  });

  it('still uses the value when one is given', async () => {
    const { lead, useCase, saved } = setup();
    await useCase.execute({ leadId: lead.id.value, convertedBy: 'owner-1', dealValue: 4200 });
    expect(saved.deal?.value.amount).toBe(4200);
  });

  it('still refuses 0 or a negative value given explicitly', async () => {
    const { lead, useCase } = setup();
    for (const dealValue of [0, -10]) {
      const result = await useCase.execute({
        leadId: lead.id.value,
        convertedBy: 'owner-1',
        dealValue,
      });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toMatch(/greater than zero/);
    }
  });
});
