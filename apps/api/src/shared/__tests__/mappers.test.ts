import { describe, it, expect } from 'vitest';
import { Lead, Account, Opportunity } from '@intelliflow/domain';
import { mapLeadToResponse, mapAccountToResponse, mapOpportunityToResponse } from '../mappers';

describe('mapLeadToResponse — Lead 360 fields (IFC-004)', () => {
  it('surfaces location, website, avatarUrl, estimatedValue, lastContactedAt and tags', () => {
    const lastContacted = new Date('2026-01-15T00:00:00.000Z');
    const lead = Lead.create({
      email: 'l360@example.com',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
      location: 'London, UK',
      website: 'https://acme.com',
      avatarUrl: 'https://cdn.example.com/a.png',
      estimatedValue: 250000,
      lastContactedAt: lastContacted,
      tags: ['enterprise', 'inbound'],
    }).value;

    const dto = mapLeadToResponse(lead);

    expect(dto.location).toBe('London, UK');
    expect(dto.website).toBe('https://acme.com');
    expect(dto.avatarUrl).toBe('https://cdn.example.com/a.png');
    expect(dto.estimatedValue).toBe(250000);
    expect(dto.lastContactedAt).toEqual(lastContacted);
    expect(dto.tags).toEqual(['enterprise', 'inbound']);
  });

  it('defaults missing Lead 360 fields to null / empty tags', () => {
    const lead = Lead.create({
      email: 'minimal@example.com',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    }).value;

    const dto = mapLeadToResponse(lead);

    expect(dto.location).toBeNull();
    expect(dto.website).toBeNull();
    expect(dto.avatarUrl).toBeNull();
    expect(dto.estimatedValue).toBeNull();
    expect(dto.lastContactedAt).toBeNull();
    expect(dto.tags).toEqual([]);
  });

  it('surfaces BANT + annualRevenue distinct from estimatedValue (IFC-242)', () => {
    const lead = Lead.create({
      email: 'bant@example.com',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
      budget: '$50k-$100k',
      authority: 'Decision maker',
      need: 'CRM solution',
      timeline: 'immediate',
      annualRevenue: '1M-10M',
    }).value;

    const dto = mapLeadToResponse(lead);

    expect(dto.budget).toBe('$50k-$100k');
    expect(dto.authority).toBe('Decision maker');
    expect(dto.need).toBe('CRM solution');
    expect(dto.timeline).toBe('immediate');
    expect(dto.annualRevenue).toBe('1M-10M');
    // company revenue band is NOT the deal value
    expect(dto.estimatedValue).toBeNull();
  });

  it('defaults missing BANT fields to null (IFC-242)', () => {
    const lead = Lead.create({
      email: 'nobant@example.com',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    }).value;

    const dto = mapLeadToResponse(lead);

    expect(dto.budget).toBeNull();
    expect(dto.authority).toBeNull();
    expect(dto.need).toBeNull();
    expect(dto.timeline).toBeNull();
    expect(dto.annualRevenue).toBeNull();
  });
});

describe('mapAccountToResponse — website serialization (IFC-270 B-13)', () => {
  it('serializes the WebsiteUrl value object to a plain string', () => {
    const account = Account.create({
      name: 'Acme Corp',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
      website: 'https://acme.example.com',
    }).value;

    const dto = mapAccountToResponse(account);

    expect(dto.website).toBe('https://acme.example.com');
    expect(typeof dto.website).toBe('string');
  });

  it('never leaks a WebsiteUrl object (must be string or null, never an object)', () => {
    const account = Account.create({
      name: 'Acme Corp',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
      website: 'https://acme.example.com',
    }).value;

    const dto = mapAccountToResponse(account);

    expect(typeof dto.website === 'string' || dto.website === null).toBe(true);
  });

  it('returns null when the account has no website', () => {
    const account = Account.create({
      name: 'No Site Inc',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    }).value;

    const dto = mapAccountToResponse(account);

    expect(dto.website).toBeNull();
  });
});

describe('mapOpportunityToResponse — closedAt (IFC-282 B-11)', () => {
  const makeOpp = () =>
    Opportunity.create({
      name: 'Deal',
      value: 50000,
      accountId: '123e4567-e89b-12d3-a456-426614174000',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    }).value;

  it('returns closedAt: null for an open opportunity', () => {
    const dto = mapOpportunityToResponse(makeOpp());
    expect(dto.closedAt).toBeNull();
  });

  it('returns closedAt as a Date once the opportunity is won', () => {
    const opp = makeOpp();
    opp.markAsWon('closer-1');

    const dto = mapOpportunityToResponse(opp);

    expect(dto.closedAt).toBeInstanceOf(Date);
  });

  it('returns closedAt as a Date once the opportunity is lost', () => {
    const opp = makeOpp();
    opp.markAsLost('Lost on price to the incumbent', 'closer-1');

    const dto = mapOpportunityToResponse(opp);

    expect(dto.closedAt).toBeInstanceOf(Date);
  });
});
