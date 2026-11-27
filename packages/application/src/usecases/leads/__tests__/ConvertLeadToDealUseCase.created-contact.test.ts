/**
 * MVP-003: a lead-to-deal conversion records the contact it created on the deal, so undo can
 * delete exactly that contact. A contact it only linked, or no contact, is never recorded.
 * The contact it creates is named from the lead (the company when there is no person name).
 */
import { describe, it, expect, vi } from 'vitest';
import { Lead, Contact, type Opportunity } from '@intelliflow/domain';
import { ConvertLeadToDealUseCase } from '../ConvertLeadToDealUseCase';

const EMAIL = 'owner@pilates.example.invalid';

function setup(
  existing: Contact | null = null,
  name: { firstName?: string; lastName?: string } = {}
) {
  const lead = Lead.create({
    email: EMAIL,
    company: 'Studio Pilates Demo',
    ...name,
    source: 'WEBSITE',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
  }).value;
  lead.qualify('owner-1', 'Wants a new website this quarter');
  lead.clearDomainEvents();

  const saved: { deal: Opportunity | null; contact: Contact | null } = {
    deal: null,
    contact: null,
  };
  const useCase = new ConvertLeadToDealUseCase(
    { findById: vi.fn(async () => lead), save: vi.fn() } as never,
    {
      findByEmailInTenant: vi.fn(async () => existing),
      save: vi.fn(async (c: Contact) => void (saved.contact = c)),
      linkToAccountIfFree: vi.fn(async () => 'attached'),
    } as never,
    { findByName: vi.fn(async () => []), save: vi.fn() } as never,
    { save: vi.fn(async (deal: Opportunity) => void (saved.deal = deal)) } as never,
    { publishAll: vi.fn() } as never,
    { run: (work: (tx: never) => Promise<unknown>) => work({} as never) } as never
  );
  return { lead, useCase, saved };
}

describe('ConvertLeadToDealUseCase createdContactId (MVP-003)', () => {
  it('records the contact the conversion created', async () => {
    const { lead, useCase, saved } = setup();
    const result = await useCase.execute({ leadId: lead.id.value, convertedBy: 'owner-1' });
    expect(result.isSuccess).toBe(true);
    expect(saved.contact).not.toBeNull();
    expect(saved.deal?.createdContactId).toBe(saved.contact!.id.value);
    expect(saved.deal?.contactId).toBe(saved.contact!.id.value);
  });

  it('does not record an existing contact the conversion only linked', async () => {
    const existing = Contact.create({
      email: EMAIL,
      firstName: 'Ana',
      lastName: 'Lima',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    }).value;
    const { lead, useCase, saved } = setup(existing);
    const result = await useCase.execute({ leadId: lead.id.value, convertedBy: 'owner-1' });
    expect(result.isSuccess).toBe(true);
    expect(saved.contact).toBeNull();
    expect(saved.deal?.contactId).toBe(existing.id.value);
    expect(saved.deal?.createdContactId).toBeUndefined();
  });

  it('records nothing when no contact is created', async () => {
    const { lead, useCase, saved } = setup();
    await useCase.execute({ leadId: lead.id.value, convertedBy: 'owner-1', createContact: false });
    expect(saved.deal?.contactId).toBeUndefined();
    expect(saved.deal?.createdContactId).toBeUndefined();
  });
});

describe('ConvertLeadToDealUseCase contact name (MVP-003)', () => {
  it('names the contact after the company when the lead has only a company and an email', async () => {
    const { lead, useCase, saved } = setup();
    await useCase.execute({ leadId: lead.id.value, convertedBy: 'owner-1' });
    expect(saved.contact?.firstName).toBe('Studio Pilates Demo');
    expect(saved.contact?.lastName).toBe('');
    expect(saved.contact?.fullName.trim()).toBe('Studio Pilates Demo');
    expect(saved.contact?.email.value).toBe(EMAIL);
  });

  it.each([
    ['a full person name', { firstName: 'Ana', lastName: 'Lima' }, ['Ana', 'Lima']],
    ['only a first name', { firstName: 'OnlyFirst' }, ['OnlyFirst', '']],
    ['only a last name', { lastName: 'OnlyLast' }, ['', 'OnlyLast']],
  ])('keeps the lead name when it has %s, and invents nothing', async (_label, name, expected) => {
    const { lead, useCase, saved } = setup(null, name);
    await useCase.execute({ leadId: lead.id.value, convertedBy: 'owner-1' });
    expect([saved.contact?.firstName, saved.contact?.lastName]).toEqual(expected);
  });

  it('never names a contact Unknown', async () => {
    const { lead, useCase, saved } = setup();
    await useCase.execute({ leadId: lead.id.value, convertedBy: 'owner-1' });
    expect(`${saved.contact?.firstName} ${saved.contact?.lastName}`).not.toMatch(/unknown/i);
  });
});
