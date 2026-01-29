/**
 * Lead Aggregate Root Tests
 *
 * These tests verify the domain logic of the Lead entity.
 * They ensure business rules are enforced and domain events are correctly emitted.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Lead, LeadAlreadyConvertedError, LeadCannotBeQualifiedError } from '../Lead';
import { LeadId } from '../LeadId';
import { Email } from '../Email';
import { LeadScore } from '../LeadScore';
import {
  LeadCreatedEvent,
  LeadScoredEvent,
  LeadStatusChangedEvent,
  LeadQualifiedEvent,
  LeadConvertedEvent,
} from '../LeadEvents';

describe('Lead Aggregate', () => {
  describe('Factory Method - create()', () => {
    it('should create a new lead with valid data', () => {
      const result = Lead.create({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CTO',
        phone: '+1-555-0100',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Lead);

      const lead = result.value;
      expect(lead.email.value).toBe('test@example.com');
      expect(lead.firstName).toBe('John');
      expect(lead.lastName).toBe('Doe');
      expect(lead.fullName).toBe('John Doe');
      expect(lead.company).toBe('Acme Corp');
      expect(lead.title).toBe('CTO');
      // PhoneNumber.value is E.164 normalized (no hyphens)
      expect(lead.phone?.value).toBe('+15550100');
      expect(lead.source).toBe('WEBSITE');
      expect(lead.status).toBe('NEW');
      expect(lead.score.value).toBe(0);
      expect(lead.ownerId).toBe('owner-123');
      expect(lead.isConverted).toBe(false);
      expect(lead.isQualified).toBe(false);
    });

    it('should create a lead with minimal data', () => {
      const result = Lead.create({
        email: 'minimal@example.com',
        ownerId: 'owner-456',
      });

      expect(result.isSuccess).toBe(true);

      const lead = result.value;
      expect(lead.email.value).toBe('minimal@example.com');
      expect(lead.firstName).toBeUndefined();
      expect(lead.lastName).toBeUndefined();
      expect(lead.fullName).toBe('');
      expect(lead.company).toBeUndefined();
      expect(lead.source).toBe('WEBSITE'); // Default source
    });

    it('should fail with invalid email', () => {
      const result = Lead.create({
        email: 'invalid-email',
        ownerId: 'owner-789',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_EMAIL');
    });

    it('should fail with empty email', () => {
      const result = Lead.create({
        email: '',
        ownerId: 'owner-999',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_EMAIL');
    });

    it('should emit LeadCreatedEvent on creation', () => {
      const result = Lead.create({
        email: 'event@example.com',
        ownerId: 'owner-123',
        source: 'REFERRAL',
      });

      const lead = result.value;
      const events = lead.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadCreatedEvent);

      const createdEvent = events[0] as LeadCreatedEvent;
      expect(createdEvent.leadId).toBe(lead.id);
      expect(createdEvent.email.value).toBe('event@example.com');
      expect(createdEvent.source).toBe('REFERRAL');
      expect(createdEvent.ownerId).toBe('owner-123');
    });

    it('should normalize email to lowercase', () => {
      const result = Lead.create({
        email: 'Test@Example.COM',
        ownerId: 'owner-123',
      });

      expect(result.value.email.value).toBe('test@example.com');
    });
  });

  describe('Getters', () => {
    let lead: Lead;

    beforeEach(() => {
      const result = Lead.create({
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CTO',
        phone: '+1-555-0100',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      });
      lead = result.value;
    });

    it('should return full name when first and last name are set', () => {
      expect(lead.fullName).toBe('John Doe');
    });

    it('should return only first name when last name is missing', () => {
      const result = Lead.create({
        email: 'jane@example.com',
        firstName: 'Jane',
        ownerId: 'owner-123',
      });

      expect(result.value.fullName).toBe('Jane');
    });

    it('should return only last name when first name is missing', () => {
      const result = Lead.create({
        email: 'smith@example.com',
        lastName: 'Smith',
        ownerId: 'owner-123',
      });

      expect(result.value.fullName).toBe('Smith');
    });

    it('should return email domain', () => {
      expect(lead.email.domain).toBe('example.com');
    });

    it('should check if lead is converted', () => {
      expect(lead.isConverted).toBe(false);

      lead.convert('contact-123', 'account-456', 'user-789');

      expect(lead.isConverted).toBe(true);
    });

    it('should check if lead is qualified', () => {
      expect(lead.isQualified).toBe(false);

      lead.qualify('user-123', 'High budget fit');

      expect(lead.isQualified).toBe(true);
    });
  });

  describe('updateScore()', () => {
    let lead: Lead;

    beforeEach(() => {
      const result = Lead.create({
        email: 'score@example.com',
        ownerId: 'owner-123',
      });
      lead = result.value;
      lead.clearDomainEvents(); // Clear creation event
    });

    it('should update lead score successfully', () => {
      const result = lead.updateScore(75, 0.9, 'v1.0.0');

      expect(result.isSuccess).toBe(true);
      expect(lead.score.value).toBe(75);
      expect(lead.score.confidence).toBe(0.9);
      expect(lead.score.tier).toBe('WARM');
    });

    it('should emit LeadScoredEvent on score update', () => {
      lead.updateScore(85, 0.95, 'v2.0.0');

      const events = lead.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadScoredEvent);

      const scoredEvent = events[0] as LeadScoredEvent;
      expect(scoredEvent.leadId).toBe(lead.id);
      expect(scoredEvent.newScore.value).toBe(85);
      expect(scoredEvent.modelVersion).toBe('v2.0.0');
    });

    it('should fail with score out of range', () => {
      const result = lead.updateScore(150, 0.8, 'v1.0.0');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LEAD_SCORE');
    });

    it('should fail with negative score', () => {
      const result = lead.updateScore(-10, 0.8, 'v1.0.0');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LEAD_SCORE');
    });

    it('should update timestamp when score changes', () => {
      const originalUpdatedAt = lead.updatedAt;

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        lead.updateScore(50, 0.7, 'v1.0.0');
        expect(lead.updatedAt).not.toEqual(originalUpdatedAt);
      }, 10);
    });
  });

  describe('changeStatus()', () => {
    let lead: Lead;

    beforeEach(() => {
      const result = Lead.create({
        email: 'status@example.com',
        ownerId: 'owner-123',
      });
      lead = result.value;
      lead.clearDomainEvents();
    });

    it('should change status successfully', () => {
      const result = lead.changeStatus('CONTACTED', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe('CONTACTED');
    });

    it('should emit LeadStatusChangedEvent', () => {
      lead.changeStatus('QUALIFIED', 'user-456');

      const events = lead.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadStatusChangedEvent);

      const statusEvent = events[0] as LeadStatusChangedEvent;
      expect(statusEvent.leadId).toBe(lead.id);
      expect(statusEvent.previousStatus).toBe('NEW');
      expect(statusEvent.newStatus).toBe('QUALIFIED');
      expect(statusEvent.changedBy).toBe('user-456');
    });

    it('should fail to change status of converted lead', () => {
      lead.convert('contact-123', null, 'user-789');
      lead.clearDomainEvents();

      const result = lead.changeStatus('QUALIFIED', 'user-999');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(LeadAlreadyConvertedError);
      expect(result.error.code).toBe('LEAD_ALREADY_CONVERTED');
    });

    it('should allow all status transitions except from CONVERTED', () => {
      const statuses: Array<'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'LOST'> = [
        'NEW',
        'CONTACTED',
        'QUALIFIED',
        'UNQUALIFIED',
        'LOST',
      ];

      statuses.forEach((status) => {
        const result = lead.changeStatus(status, 'user-123');
        expect(result.isSuccess).toBe(true);
      });
    });
  });

  describe('qualify()', () => {
    let lead: Lead;

    beforeEach(() => {
      const result = Lead.create({
        email: 'qualify@example.com',
        ownerId: 'owner-123',
      });
      lead = result.value;
      lead.clearDomainEvents();
    });

    it('should qualify a NEW lead', () => {
      const result = lead.qualify('user-123', 'Strong product fit');

      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe('QUALIFIED');
      expect(lead.isQualified).toBe(true);
    });

    it('should qualify a CONTACTED lead', () => {
      lead.changeStatus('CONTACTED', 'user-123');
      lead.clearDomainEvents();

      const result = lead.qualify('user-456', 'Good engagement');

      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe('QUALIFIED');
    });

    it('should emit LeadQualifiedEvent', () => {
      lead.qualify('user-789', 'High budget');

      const events = lead.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadQualifiedEvent);

      const qualifiedEvent = events[0] as LeadQualifiedEvent;
      expect(qualifiedEvent.leadId).toBe(lead.id);
      expect(qualifiedEvent.qualifiedBy).toBe('user-789');
      expect(qualifiedEvent.reason).toBe('High budget');
    });

    it('should fail to qualify an UNQUALIFIED lead', () => {
      lead.changeStatus('UNQUALIFIED', 'user-123');

      const result = lead.qualify('user-456', 'Reconsidered');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(LeadCannotBeQualifiedError);
      expect(result.error.code).toBe('LEAD_CANNOT_BE_QUALIFIED');
    });

    it('should fail to qualify a CONVERTED lead', () => {
      lead.convert('contact-123', null, 'user-789');

      const result = lead.qualify('user-999', 'Already converted');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(LeadAlreadyConvertedError);
    });

    it('should fail to qualify a LOST lead', () => {
      lead.changeStatus('LOST', 'user-123');

      const result = lead.qualify('user-456', 'Tried to recover');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(LeadCannotBeQualifiedError);
    });
  });

  describe('convert()', () => {
    let lead: Lead;

    beforeEach(() => {
      const result = Lead.create({
        email: 'convert@example.com',
        ownerId: 'owner-123',
      });
      lead = result.value;
      lead.clearDomainEvents();
    });

    it('should convert lead successfully', () => {
      const result = lead.convert('contact-123', 'account-456', 'user-789');

      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe('CONVERTED');
      expect(lead.isConverted).toBe(true);
    });

    it('should convert lead without account', () => {
      const result = lead.convert('contact-999', null, 'user-111');

      expect(result.isSuccess).toBe(true);
      expect(lead.isConverted).toBe(true);
    });

    it('should emit LeadConvertedEvent', () => {
      lead.convert('contact-555', 'account-666', 'user-777');

      const events = lead.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadConvertedEvent);

      const convertedEvent = events[0] as LeadConvertedEvent;
      expect(convertedEvent.leadId).toBe(lead.id);
      expect(convertedEvent.contactId).toBe('contact-555');
      expect(convertedEvent.accountId).toBe('account-666');
      expect(convertedEvent.convertedBy).toBe('user-777');
    });

    it('should fail to convert already converted lead', () => {
      lead.convert('contact-123', 'account-456', 'user-789');

      const result = lead.convert('contact-999', 'account-111', 'user-222');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(LeadAlreadyConvertedError);
      expect(result.error.code).toBe('LEAD_ALREADY_CONVERTED');
    });
  });

  describe('updateContactInfo()', () => {
    let lead: Lead;

    beforeEach(() => {
      const result = Lead.create({
        email: 'update@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-123',
      });
      lead = result.value;
    });

    it('should update contact information', () => {
      lead.updateContactInfo({
        firstName: 'Jane',
        company: 'New Corp',
        title: 'CEO',
      });

      expect(lead.firstName).toBe('Jane');
      expect(lead.lastName).toBe('Doe'); // Unchanged
      expect(lead.company).toBe('New Corp');
      expect(lead.title).toBe('CEO');
    });

    it('should update phone number', () => {
      lead.updateContactInfo({
        phone: '+1-555-9999',
      });

      expect(lead.phone).toBe('+1-555-9999');
    });

    it('should update timestamp', () => {
      const originalUpdatedAt = lead.updatedAt;

      setTimeout(() => {
        lead.updateContactInfo({ title: 'VP' });
        expect(lead.updatedAt).not.toEqual(originalUpdatedAt);
      }, 10);
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute lead from persistence', () => {
      const id = LeadId.generate();
      const emailResult = Email.create('reconstitute@example.com');
      const now = new Date();

      const lead = Lead.reconstitute(id, {
        email: emailResult.value,
        firstName: 'Reconstituted',
        lastName: 'Lead',
        company: 'Test Corp',
        title: 'Manager',
        phone: '+1-555-0000',
        source: 'EMAIL',
        status: 'QUALIFIED',
        score: { value: 80, confidence: 0.9 },
        ownerId: 'owner-999',
        createdAt: now,
        updatedAt: now,
      });

      expect(lead.id).toBe(id);
      expect(lead.email.value).toBe('reconstitute@example.com');
      expect(lead.firstName).toBe('Reconstituted');
      expect(lead.status).toBe('QUALIFIED');
      expect(lead.score.value).toBe(80);
      expect(lead.score.confidence).toBe(0.9);
    });

    it('should handle invalid score in reconstitution', () => {
      const id = LeadId.generate();
      const emailResult = Email.create('invalid@example.com');

      const lead = Lead.reconstitute(id, {
        email: emailResult.value,
        source: 'WEBSITE',
        status: 'NEW',
        score: { value: 200, confidence: 0.5 }, // Invalid score
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Should default to zero score when invalid
      expect(lead.score.value).toBe(0);
    });
  });

  describe('toJSON()', () => {
    it('should serialize lead to JSON', () => {
      const result = Lead.create({
        email: 'json@example.com',
        firstName: 'JSON',
        lastName: 'Test',
        company: 'JSON Corp',
        ownerId: 'owner-123',
        source: 'SOCIAL',
      });

      const lead = result.value;
      lead.updateScore(65, 0.85, 'v1.0.0');

      const json = lead.toJSON();

      expect(json).toHaveProperty('id');
      expect(json.email).toBe('json@example.com');
      expect(json.firstName).toBe('JSON');
      expect(json.lastName).toBe('Test');
      expect(json.company).toBe('JSON Corp');
      expect(json.source).toBe('SOCIAL');
      expect(json.status).toBe('NEW');
      expect(json.score).toMatchObject({
        score: 65,
        confidence: 0.85,
        tier: 'WARM',
      });
      expect(json.ownerId).toBe('owner-123');
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
    });
  });

  describe('Domain Events', () => {
    it('should accumulate multiple domain events', () => {
      const result = Lead.create({
        email: 'events@example.com',
        ownerId: 'owner-123',
      });

      const lead = result.value;

      // Creation event is already added
      expect(lead.getDomainEvents()).toHaveLength(1);

      lead.updateScore(75, 0.9, 'v1.0.0');
      expect(lead.getDomainEvents()).toHaveLength(2);

      lead.changeStatus('CONTACTED', 'user-123');
      expect(lead.getDomainEvents()).toHaveLength(3);

      lead.qualify('user-456', 'Good fit');
      expect(lead.getDomainEvents()).toHaveLength(4);
    });

    it('should clear domain events', () => {
      const result = Lead.create({
        email: 'clear@example.com',
        ownerId: 'owner-123',
      });

      const lead = result.value;
      expect(lead.getDomainEvents()).toHaveLength(1);

      lead.clearDomainEvents();
      expect(lead.getDomainEvents()).toHaveLength(0);
    });
  });
});
