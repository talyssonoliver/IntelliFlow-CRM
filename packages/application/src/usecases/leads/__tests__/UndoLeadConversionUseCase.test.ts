/**
 * MVP-003: undo a lead-to-deal conversion while nothing has happened since.
 */
import { describe, it, expect, vi } from 'vitest';
import { Lead, LeadStatusChangedEvent } from '@intelliflow/domain';
import { UndoLeadConversionUseCase, describeUndoBlockers } from '../UndoLeadConversionUseCase';
import type {
  ConversionUndoBlocker,
  ConversionUndoPort,
  ConvertedDeal,
} from '../../../ports/repositories/ConversionUndoPort';

const TX = { tx: true } as never;

function convertedLead(tenantId = 'tenant-1'): Lead {
  const lead = Lead.create({
    email: 'owner@pilates.example.invalid',
    company: 'Pilates Living',
    source: 'WEBSITE',
    ownerId: 'owner-1',
    tenantId,
  }).value;
  lead.qualify('owner-1', 'Wants a new website this quarter');
  lead.convert('contact-1', 'account-1', 'owner-1');
  lead.clearDomainEvents();
  return lead;
}

function setup(
  opts: {
    lead?: Lead | null;
    deal?: Partial<ConvertedDeal> | null;
    blockers?: ConversionUndoBlocker[];
    blockersInTx?: ConversionUndoBlocker[];
    saveFails?: boolean;
  } = {}
) {
  const lead = opts.lead === undefined ? convertedLead() : opts.lead;
  const deal: ConvertedDeal | null =
    opts.deal === null
      ? null
      : {
          opportunityId: 'opp-1',
          tenantId: 'tenant-1',
          sourceLeadId: lead?.id.value ?? 'lead-gone',
          stage: 'PROSPECTING',
          deleted: false,
          contactId: 'contact-1',
          contactCreatedByConversion: true,
          ...opts.deal,
        };
  const port = {
    findDeal: vi.fn(async () => deal),
    findBlockers: vi.fn(async (_d: ConvertedDeal, tx?: unknown) =>
      tx ? (opts.blockersInTx ?? opts.blockers ?? []) : (opts.blockers ?? [])
    ),
    removeCreatedRecords: vi.fn(async () => undefined),
  } satisfies ConversionUndoPort;
  const leadRepository = {
    findById: vi.fn(async () => lead),
    save: vi.fn(async () => {
      if (opts.saveFails) throw new Error('Lead x is no longer in status CONVERTED');
    }),
  };
  const eventBus = { publishAll: vi.fn(async () => undefined) };
  const useCase = new UndoLeadConversionUseCase(
    leadRepository as never,
    port,
    eventBus as never,
    { run: (work: (tx: never) => Promise<unknown>) => work(TX) } as never
  );
  return { lead, deal, port, leadRepository, eventBus, useCase };
}

const input = { opportunityId: 'opp-1', tenantId: 'tenant-1', undoneBy: 'owner-1' };

describe('UndoLeadConversionUseCase.execute', () => {
  it('puts the lead back to QUALIFIED and removes what the conversion created, in one transaction', async () => {
    const { lead, port, leadRepository, eventBus, useCase } = setup();
    const result = await useCase.execute(input);

    expect(result.isSuccess).toBe(true);
    expect(result.value.leadId).toBe(lead!.id.value);
    expect(lead!.status).toBe('QUALIFIED');
    expect(port.findBlockers).toHaveBeenLastCalledWith(expect.anything(), TX);
    expect(port.removeCreatedRecords).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: 'opp-1', contactCreatedByConversion: true }),
      TX
    );
    expect(leadRepository.save).toHaveBeenCalledWith(lead, { expectedStatus: 'CONVERTED' }, TX);
    const [events] = eventBus.publishAll.mock.calls[0] as unknown as [unknown[]];
    expect(events[0]).toBeInstanceOf(LeadStatusChangedEvent);
    expect(lead!.getDomainEvents()).toHaveLength(0);
  });

  it('explains why when something has happened since, and changes nothing', async () => {
    const { lead, port, useCase } = setup({ blockers: ['STAGE_CHANGED', 'DEAL_HAS_TASKS'] });
    const result = await useCase.execute(input);
    expect(result.isFailure).toBe(true);
    expect(result.error.message).toBe(describeUndoBlockers(['STAGE_CHANGED', 'DEAL_HAS_TASKS']));
    expect(result.error.message).toMatch(/moved past Prospecting; the deal has tasks/);
    expect(port.removeCreatedRecords).not.toHaveBeenCalled();
    expect(lead!.status).toBe('CONVERTED');
  });

  it('re-checks inside the transaction and rolls back if something happened in between', async () => {
    const { port, leadRepository, useCase } = setup({ blockersInTx: ['DEAL_HAS_ACTIVITY'] });
    const result = await useCase.execute(input);
    expect(result.isFailure).toBe(true);
    expect(result.error.message).toMatch(/emails, calls, files/);
    expect(port.removeCreatedRecords).not.toHaveBeenCalled();
    expect(leadRepository.save).not.toHaveBeenCalled();
  });

  it('reports a failed save (the lead changed meanwhile) as a persistence error', async () => {
    const { useCase } = setup({ saveFails: true });
    const result = await useCase.execute(input);
    expect(result.isFailure).toBe(true);
    expect(result.error.message).toMatch(/^Failed to undo the conversion/);
  });

  it('refuses a deal that was not converted from a lead', async () => {
    const { port, useCase } = setup({ deal: { sourceLeadId: null } });
    const result = await useCase.execute(input);
    expect(result.error.message).toMatch(/not converted from a lead/);
    expect(port.findBlockers).not.toHaveBeenCalled();
  });

  it('refuses when the lead is no longer converted', async () => {
    const lead = convertedLead();
    lead.undoConversion('someone');
    const { useCase } = setup({ lead });
    expect((await useCase.execute(input)).error.message).toMatch(/not converted from a lead/);
  });

  it('treats a missing or deleted deal, or a lead from another tenant, as not found', async () => {
    expect((await setup({ deal: null }).useCase.execute(input)).error.message).toMatch(/not found/);
    expect((await setup({ deal: { deleted: true } }).useCase.execute(input)).error.message).toMatch(
      /not found/
    );
    const other = setup({ lead: convertedLead('tenant-2') });
    expect((await other.useCase.execute(input)).error.message).toMatch(/Lead not found/);
    expect((await setup({ lead: null }).useCase.execute(input)).error.message).toMatch(
      /Lead not found/
    );
  });

  it('requires who undid it', async () => {
    const result = await setup().useCase.execute({ ...input, undoneBy: ' ' });
    expect(result.error.message).toMatch(/undoneBy is required/);
  });

  it('reports a deal deleted between the check and the transaction', async () => {
    const s = setup();
    s.port.findDeal.mockResolvedValueOnce(s.deal).mockResolvedValueOnce(null);
    const result = await s.useCase.execute(input);
    expect(result.error.message).toMatch(/deleted meanwhile/);
  });
});

describe('UndoLeadConversionUseCase.check', () => {
  it('says it can be undone when nothing has happened since', async () => {
    const { lead, useCase } = setup();
    const result = await useCase.check(input);
    expect(result.value).toEqual({ canUndo: true, leadId: lead!.id.value, reasons: [] });
  });

  it('lists the reasons when it cannot', async () => {
    const result = await setup({ blockers: ['CONTACT_HAS_OTHER_DEALS'] }).useCase.check(input);
    expect(result.value.canUndo).toBe(false);
    expect(result.value.reasons).toEqual(['the contact created with it is on another deal']);
  });

  it('has no undo for a deal not converted from a lead, or a lead no longer converted', async () => {
    const plain = await setup({ deal: { sourceLeadId: null } }).useCase.check(input);
    expect(plain.value).toMatchObject({ canUndo: false, leadId: null });
    const lead = convertedLead();
    lead.undoConversion('someone');
    const back = await setup({ lead }).useCase.check(input);
    expect(back.value.canUndo).toBe(false);
  });

  it('treats a missing deal as not found', async () => {
    expect((await setup({ deal: null }).useCase.check(input)).isFailure).toBe(true);
  });
});
