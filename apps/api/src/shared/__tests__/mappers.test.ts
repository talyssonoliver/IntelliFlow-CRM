import { describe, it, expect } from 'vitest';
import { Lead } from '@intelliflow/domain';
import { mapLeadToResponse } from '../mappers';

describe('mapLeadToResponse — Lead 360 fields (IFC-004)', () => {
  it('surfaces location, website, avatarUrl, estimatedValue and tags', () => {
    const lead = Lead.create({
      email: 'l360@example.com',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
      location: 'London, UK',
      website: 'https://acme.com',
      avatarUrl: 'https://cdn.example.com/a.png',
      estimatedValue: 250000,
      tags: ['enterprise', 'inbound'],
    }).value;

    const dto = mapLeadToResponse(lead);

    expect(dto.location).toBe('London, UK');
    expect(dto.website).toBe('https://acme.com');
    expect(dto.avatarUrl).toBe('https://cdn.example.com/a.png');
    expect(dto.estimatedValue).toBe(250000);
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
    expect(dto.tags).toEqual([]);
  });
});
