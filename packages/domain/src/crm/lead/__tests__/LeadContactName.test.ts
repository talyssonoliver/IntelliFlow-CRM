import { describe, it, expect } from 'vitest';
import { contactNameFromLead, contactNameFields } from '../LeadContactName';
import { Contact } from '../../contact/Contact';

/** MVP-003: a contact created from a lead is named from what the lead has, never "Unknown". */
describe('contactNameFromLead', () => {
  const company = 'Pilates Living';
  const email = 'owner@pilates.example.invalid';

  it('uses the person name when the lead has one', () => {
    const name = contactNameFromLead({ firstName: 'Ana', lastName: 'Lima', company, email });
    expect(name).toEqual({ firstName: 'Ana', lastName: 'Lima', display: 'Ana Lima' });
  });

  it.each([
    ['first name only', { firstName: 'Ana' }, { firstName: 'Ana', lastName: '', display: 'Ana' }],
    ['last name only', { lastName: 'Lima' }, { firstName: '', lastName: 'Lima', display: 'Lima' }],
    [
      'a name with spaces around it',
      { firstName: ' Ana ', lastName: ' ' },
      { firstName: 'Ana', lastName: '', display: 'Ana' },
    ],
  ])('keeps a half person name as it is (%s), never filling the rest', (_label, lead, expected) => {
    expect(contactNameFromLead({ ...lead, company, email })).toEqual(expected);
  });

  it('accepts an Email value object and returns just the stored halves', () => {
    expect(contactNameFields({ email: { value: email } })).toEqual({
      firstName: email,
      lastName: '',
    });
  });

  it('names a lead with only a company after the company', () => {
    expect(contactNameFromLead({ company, email })).toEqual({
      firstName: company,
      lastName: '',
      display: company,
    });
  });

  it.each([null, undefined, '', '   '])('treats a blank person name (%j) as none', (blank) => {
    const name = contactNameFromLead({ firstName: blank, lastName: blank, company, email });
    expect(name.display).toBe(company);
  });

  it('falls back to the whole email address, not a name made from it', () => {
    const name = contactNameFromLead({ email });
    expect(name).toEqual({ firstName: email, lastName: '', display: email });
    expect(name.display).not.toMatch(/^owner$/i);
  });

  it('has a last resort and never says Unknown', () => {
    const name = contactNameFromLead({});
    expect(name.display).toBe('Unnamed contact');
    for (const lead of [{}, { company }, { email }, { firstName: 'Ana' }, { lastName: 'Lima' }]) {
      const { firstName, lastName, display } = contactNameFromLead(lead);
      expect(`${firstName}${lastName}${display}`).not.toMatch(/unknown/i);
    }
  });
});

describe('a contact named from a lead', () => {
  it('reads as the company, without a stray space after it', () => {
    const name = contactNameFromLead({
      company: 'Pilates Living',
      email: 'owner@pilates.example.invalid',
    });
    const contact = Contact.create({
      email: 'owner@pilates.example.invalid',
      firstName: name.firstName,
      lastName: name.lastName,
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    }).value;
    expect(contact.fullName).toBe('Pilates Living');
  });
});
