import { describe, it, expect } from 'vitest';
import { Lead, LeadNotConvertedError } from '../Lead';
import { LeadStatusChangedEvent } from '../LeadEvents';

/** MVP-003: a converted lead can go back to QUALIFIED when its conversion is undone. */
function qualifiedLead(): Lead {
  const lead = Lead.create({
    email: 'buyer@example.com',
    source: 'WEBSITE',
    ownerId: 'owner-1',
  }).value;
  lead.qualify('owner-1', 'Budget and timeline confirmed');
  lead.clearDomainEvents();
  return lead;
}

describe('Lead.undoConversion (MVP-003)', () => {
  it('puts a converted lead back to QUALIFIED and records who did it', () => {
    const lead = qualifiedLead();
    lead.convert('contact-1', 'account-1', 'owner-1');
    lead.clearDomainEvents();

    const result = lead.undoConversion('owner-1');

    expect(result.isSuccess).toBe(true);
    expect(lead.status).toBe('QUALIFIED');
    expect(lead.isConverted).toBe(false);
    const [event] = lead.getDomainEvents();
    expect(event).toBeInstanceOf(LeadStatusChangedEvent);
    expect(event).toMatchObject({
      previousStatus: 'CONVERTED',
      newStatus: 'QUALIFIED',
      changedBy: 'owner-1',
    });
  });

  it('refuses a lead that is not converted, and changes nothing', () => {
    const lead = qualifiedLead();
    const result = lead.undoConversion('owner-1');
    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(LeadNotConvertedError);
    expect(lead.status).toBe('QUALIFIED');
    expect(lead.getDomainEvents()).toHaveLength(0);
  });

  it('lets the lead be converted again after an undo', () => {
    const lead = qualifiedLead();
    lead.convert('contact-1', 'account-1', 'owner-1');
    lead.undoConversion('owner-1');
    expect(lead.convert('contact-2', 'account-1', 'owner-1').isSuccess).toBe(true);
    expect(lead.status).toBe('CONVERTED');
  });
});
