/**
 * MVP-003: what counts as "something has happened since" a conversion, and what undo deletes.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  PrismaConversionUndoAdapter,
  AI_INSIGHT_AUTHOR,
  CONVERSION_CONTACT_WINDOW_MS,
} from '../PrismaConversionUndoAdapter';

const COUNTED = [
  'task',
  'dealProduct',
  'setupInstalment',
  'dealFile',
  'activityEvent',
  'emailRecord',
  'callRecord',
  'document',
  'feedbackSurvey',
  'ticket',
  'contactNote',
  'contactActivity',
  'calendarEvent',
  'chatConversation',
] as const;

/** A fake client: every count is 0 unless `counts` says otherwise for that model and filter. */
function fakePrisma(counts: (model: string, where: Record<string, unknown>) => number = () => 0) {
  const db: Record<string, unknown> = { $queryRaw: vi.fn(async () => []) };
  for (const model of COUNTED) {
    db[model] = { count: vi.fn(async ({ where }) => counts(model, where)) };
  }
  db.opportunity = {
    findFirst: vi.fn(),
    count: vi.fn(async ({ where }) => counts('opportunity', where)),
    delete: vi.fn(),
  };
  db.contact = { delete: vi.fn() };
  return db as never as Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
    $queryRaw: ReturnType<typeof vi.fn>;
  };
}

/** The moment a conversion created its deal (and, together with it, its contact). */
const CONVERTED_AT = new Date('2026-11-17T10:00:00.000Z');
const msAfter = (ms: number) => new Date(CONVERTED_AT.getTime() + ms);

/** A deal row as Prisma returns it, with its contact created offsetMs after the deal. */
function dealRow(contact: { leadId: string | null; offsetMs: number } | null, extra = {}) {
  return {
    id: 'opp-1',
    tenantId: 'tenant-1',
    sourceLeadId: 'lead-1',
    stage: 'PROSPECTING',
    deletedAt: null,
    createdAt: CONVERTED_AT,
    contactId: 'contact-1',
    contact: contact ? { leadId: contact.leadId, createdAt: msAfter(contact.offsetMs) } : null,
    ...extra,
  };
}

const deal = {
  opportunityId: 'opp-1',
  tenantId: 'tenant-1',
  sourceLeadId: 'lead-1',
  stage: 'PROSPECTING',
  deleted: false,
  contactId: 'contact-1',
  contactCreatedByConversion: true,
};

describe('PrismaConversionUndoAdapter.findDeal', () => {
  it('reads the deal in the tenant and tells whether the conversion created its contact', async () => {
    const db = fakePrisma();
    db.opportunity.findFirst.mockResolvedValue(dealRow({ leadId: 'lead-1', offsetMs: -40 }));
    const adapter = new PrismaConversionUndoAdapter(db as never);
    expect(await adapter.findDeal('opp-1', 'tenant-1')).toEqual(deal);
    expect(db.opportunity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'opp-1', tenantId: 'tenant-1' } })
    );
  });

  it('marks a linked existing contact, a deleted deal and a missing deal', async () => {
    const db = fakePrisma();
    db.opportunity.findFirst.mockResolvedValueOnce(
      dealRow(
        { leadId: 'other-lead', offsetMs: 0 },
        { deletedAt: new Date(), contactId: 'contact-9' }
      )
    );
    const adapter = new PrismaConversionUndoAdapter(db as never);
    const found = await adapter.findDeal('opp-1', 'tenant-1');
    expect(found).toMatchObject({ deleted: true, contactCreatedByConversion: false });
    db.opportunity.findFirst.mockResolvedValueOnce(null);
    expect(await adapter.findDeal('opp-x', 'tenant-1')).toBeNull();
  });

  // A contact counts as created by the conversion only if it points at the lead AND was created with the deal.
  const HOUR = 3_600_000;
  const linked = (offsetMs: number, leadId: string | null = 'lead-1') => ({ leadId, offsetMs });
  it.each([
    ['created with the deal', linked(-40), {}, true],
    ['created just after the deal', linked(25), {}, true],
    ['linked to the lead but created an hour before', linked(-HOUR), {}, false],
    ['linked to the lead but created an hour after', linked(HOUR), {}, false],
    ['just outside the window', linked(-CONVERSION_CONTACT_WINDOW_MS - 1), {}, false],
    ['created with the deal but linked to another lead', linked(0, 'lead-2'), {}, false],
    ['created with the deal but linked to no lead', linked(0, null), {}, false],
    ['absent', null, { contactId: null }, false],
    ['created with a deal that has no source lead', linked(0), { sourceLeadId: null }, false],
  ])('a contact %s: created by the conversion = %s', async (_label, contact, extra, created) => {
    const db = fakePrisma();
    db.opportunity.findFirst.mockResolvedValue(dealRow(contact, extra));
    const found = await new PrismaConversionUndoAdapter(db as never).findDeal('opp-1', 'tenant-1');
    expect(found?.contactCreatedByConversion).toBe(created);
  });

  it('uses the transaction client when one is given', async () => {
    const db = fakePrisma();
    const tx = fakePrisma();
    tx.opportunity.findFirst.mockResolvedValue(null);
    await new PrismaConversionUndoAdapter(db as never).findDeal('opp-1', 'tenant-1', tx as never);
    expect(tx.opportunity.findFirst).toHaveBeenCalled();
    expect(db.opportunity.findFirst).not.toHaveBeenCalled();
  });
});

describe('PrismaConversionUndoAdapter.findBlockers', () => {
  it('finds nothing for an untouched conversion', async () => {
    const adapter = new PrismaConversionUndoAdapter(fakePrisma() as never);
    expect(await adapter.findBlockers(deal)).toEqual([]);
  });

  it('ignores the notes the AI writes by itself on the new contact', async () => {
    const db = fakePrisma();
    const adapter = new PrismaConversionUndoAdapter(db as never);
    await adapter.findBlockers(deal);
    expect(db.contactActivity.count).toHaveBeenCalledWith({
      where: { contactId: 'contact-1', NOT: { userName: AI_INSIGHT_AUTHOR } },
    });
  });

  it.each([
    ['a stage change', { ...deal, stage: 'QUALIFICATION' }, () => 0, 'STAGE_CHANGED'],
    [
      'a task on the deal',
      deal,
      (m: string, w: Record<string, unknown>) => (m === 'task' && w.opportunityId ? 1 : 0),
      'DEAL_HAS_TASKS',
    ],
    [
      'an email on the deal',
      deal,
      (m: string) => (m === 'emailRecord' ? 1 : 0),
      'DEAL_HAS_ACTIVITY',
    ],
    [
      'a product on the deal',
      deal,
      (m: string) => (m === 'dealProduct' ? 1 : 0),
      'DEAL_HAS_ACTIVITY',
    ],
    [
      'a note on the contact',
      deal,
      (m: string) => (m === 'contactNote' ? 1 : 0),
      'CONTACT_HAS_ACTIVITY',
    ],
    [
      'a task on the contact',
      deal,
      (m: string, w: Record<string, unknown>) => (m === 'task' && w.contactId ? 1 : 0),
      'CONTACT_HAS_ACTIVITY',
    ],
    [
      'another deal on the contact',
      deal,
      (m: string) => (m === 'opportunity' ? 1 : 0),
      'CONTACT_HAS_OTHER_DEALS',
    ],
  ])('blocks on %s', async (_label, d, counts, blocker) => {
    const adapter = new PrismaConversionUndoAdapter(fakePrisma(counts) as never);
    expect(await adapter.findBlockers(d)).toContain(blocker);
  });

  it("does not look at a linked contact's own records (it is kept)", async () => {
    const db = fakePrisma(() => 5);
    const adapter = new PrismaConversionUndoAdapter(db as never);
    const blockers = await adapter.findBlockers({ ...deal, contactCreatedByConversion: false });
    expect(blockers).not.toContain('CONTACT_HAS_ACTIVITY');
    expect(blockers).not.toContain('CONTACT_HAS_OTHER_DEALS');
    expect(db.contactNote.count).not.toHaveBeenCalled();
  });
});

describe('PrismaConversionUndoAdapter.removeCreatedRecords', () => {
  it('deletes the deal and the contact the conversion created', async () => {
    const tx = fakePrisma();
    await new PrismaConversionUndoAdapter(fakePrisma() as never).removeCreatedRecords(
      deal,
      tx as never
    );
    expect(tx.opportunity.delete).toHaveBeenCalledWith({ where: { id: 'opp-1' } });
    expect(tx.contact.delete).toHaveBeenCalledWith({ where: { id: 'contact-1' } });
  });

  it('keeps a contact that existed before the conversion', async () => {
    const tx = fakePrisma();
    await new PrismaConversionUndoAdapter(fakePrisma() as never).removeCreatedRecords(
      { ...deal, contactCreatedByConversion: false },
      tx as never
    );
    expect(tx.opportunity.delete).toHaveBeenCalled();
    expect(tx.contact.delete).not.toHaveBeenCalled();
  });
});

describe('PrismaConversionUndoAdapter.lockRecords', () => {
  const sql = (call: unknown[]) => (call[0] as string[]).join('?');

  it('locks the deal, then the contact the conversion created, scoped to the tenant', async () => {
    const tx = fakePrisma();
    await new PrismaConversionUndoAdapter(fakePrisma() as never).lockRecords(deal, tx as never);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const [first, second] = tx.$queryRaw.mock.calls;
    expect(sql(first)).toMatch(/FROM opportunities WHERE id = \? AND "tenantId" = \? FOR UPDATE/);
    expect(first.slice(1)).toEqual(['opp-1', 'tenant-1']);
    expect(sql(second)).toMatch(/FROM contacts WHERE id = \? AND "tenantId" = \? FOR UPDATE/);
    expect(second.slice(1)).toEqual(['contact-1', 'tenant-1']);
  });

  it('locks only the deal when the contact was not created by the conversion', async () => {
    const tx = fakePrisma();
    await new PrismaConversionUndoAdapter(fakePrisma() as never).lockRecords(
      { ...deal, contactCreatedByConversion: false },
      tx as never
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sql(tx.$queryRaw.mock.calls[0])).toMatch(/FROM opportunities/);
  });
});
