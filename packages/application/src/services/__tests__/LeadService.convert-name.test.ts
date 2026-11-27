/**
 * MVP-012 (register row 26): converting a lead through LeadService.convertLead names the contact
 * from what the lead has (company, then email), never "Unknown Unknown".
 */
import { describe, it, expect, vi } from 'vitest';
import { Lead, type Contact, type LeadRepository } from '@intelliflow/domain';
import { LeadService } from '../LeadService';
import type { AIServicePort, EventBusPort } from '../../ports/external';
import type { ContactRepository, AccountRepository } from '../../ports/repositories';
import type { TransactionPort } from '../../ports/TransactionPort';

function qualifiedLead(props: { firstName?: string; lastName?: string; company?: string }): Lead {
  const created = Lead.create({
    email: 'owner@pilates.example.invalid',
    source: 'WEBSITE',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    ...props,
  } as never);
  if (created.isFailure) throw new Error(created.error.message);
  const lead = created.value;
  lead.updateScore(70, 0.8, 'test-v1');
  lead.qualify('user-1', 'Good fit');
  return lead;
}

async function convertAndGetContact(lead: Lead): Promise<Contact> {
  const saved: Contact[] = [];
  const leadRepository = {
    findById: vi.fn().mockResolvedValue(lead),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as LeadRepository;
  const contactRepository = {
    save: vi.fn(async (c: Contact) => void saved.push(c)),
  } as unknown as ContactRepository;
  const bus = {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBusPort;
  const tx: TransactionPort = { run: (work) => work({} as never) };
  const service = new LeadService(
    leadRepository,
    contactRepository,
    {} as unknown as AccountRepository,
    {} as unknown as AIServicePort,
    bus,
    tx
  );
  const result = await service.convertLead(lead.id.value, null, 'user-1');
  expect(result.isSuccess).toBe(true);
  return saved[0];
}

describe('LeadService.convertLead contact name', () => {
  it('names the contact after the company when the lead has no person name', async () => {
    const contact = await convertAndGetContact(qualifiedLead({ company: 'Studio Pilates Demo' }));
    expect(contact.firstName).toBe('Studio Pilates Demo');
    expect(contact.lastName).toBe('');
  });

  it('falls back to the email when the lead has neither a person name nor a company', async () => {
    const contact = await convertAndGetContact(qualifiedLead({}));
    expect(contact.firstName).toBe('owner@pilates.example.invalid');
    expect(contact.lastName).toBe('');
  });

  it('keeps a real person name', async () => {
    const contact = await convertAndGetContact(
      qualifiedLead({ firstName: 'Ana', lastName: 'Lima', company: 'Studio Pilates Demo' })
    );
    expect([contact.firstName, contact.lastName]).toEqual(['Ana', 'Lima']);
  });
});
