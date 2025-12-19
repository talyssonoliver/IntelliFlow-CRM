/**
 * Lead Domain Model Tests
 *
 * These tests verify the domain logic of the Lead aggregate root.
 * They ensure business rules are enforced correctly and domain events
 * are emitted as expected.
 *
 * This is an example test that demonstrates:
 * - Testing domain logic in isolation
 * - Using fixtures for test data
 * - Verifying business rules
 * - Testing domain events
 * - Achieving >95% coverage (domain layer requirement)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Lead } from '../src/crm/lead/Lead';
import { LeadId } from '../src/crm/lead/LeadId';
import { Email } from '../src/crm/lead/Email';
import { LeadScore } from '../src/crm/lead/LeadScore';
import {
  LeadCreatedEvent,
  LeadScoredEvent,
  LeadStatusChangedEvent,
  LeadQualifiedEvent,
  LeadConvertedEvent,
} from '../src/crm/lead/LeadEvents';
import { LeadAlreadyConvertedError, LeadCannotBeQualifiedError } from '../src/crm/lead/Lead';

describe('Lead Domain Model', () => {
  describe('Factory Method - Lead.create()', () => {
    it('should create a new lead with valid data', () => {
      // Arrange
      const leadData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CTO',
        phone: '+1-555-0100',
        source: 'WEBSITE' as const,
        ownerId: 'owner-123',
      };

      // Act
      const result = Lead.create(leadData);

      // Assert
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Lead);

      const lead = result.value;
      expect(lead.email.value).toBe('test@example.com');
      expect(lead.firstName).toBe('John');
      expect(lead.lastName).toBe('Doe');
      expect(lead.fullName).toBe('John Doe');
      expect(lead.company).toBe('Acme Corp');
      expect(lead.status).toBe('NEW');
      expect(lead.score.value).toBe(0);
    });

    it('should create a lead with minimal required data', () => {
      // Arrange & Act
      const result = Lead.create({
        email: 'minimal@example.com',
        ownerId: 'owner-123',
      });

      // Assert
      expect(result.isSuccess).toBe(true);
      const lead = result.value;
      expect(lead.email.value).toBe('minimal@example.com');
      expect(lead.source).toBe('WEBSITE'); // Default source
    });

    it('should fail with invalid email format', () => {
      // Arrange & Act
      const result = Lead.create({
        email: 'not-an-email',
        ownerId: 'owner-123',
      });

      // Assert
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_EMAIL');
    });

    it('should emit LeadCreatedEvent on creation', () => {
      // Arrange & Act
      const result = Lead.create({
        email: 'event@example.com',
        ownerId: 'owner-123',
        source: 'REFERRAL',
      });

      // Assert
      const lead = result.value;
      const events = lead.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadCreatedEvent);

      const event = events[0] as LeadCreatedEvent;
      expect(event.leadId).toBe(lead.id);
      expect(event.email.value).toBe('event@example.com');
      expect(event.source).toBe('REFERRAL');
    });

    it('should normalize email to lowercase', () => {
      // Arrange & Act
      const result = Lead.create({
        email: 'Test@EXAMPLE.COM',
        ownerId: 'owner-123',
      });

      // Assert
      expect(result.value.email.value).toBe('test@example.com');
    });
  });

  describe('Value Object - Email', () => {
    it('should create valid email', () => {
      const result = Email.create('valid@example.com');
      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('valid@example.com');
    });

    it('should extract domain from email', () => {
      const email = Email.create('user@company.com').value;
      expect(email.domain).toBe('company.com');
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = ['invalid', '@example.com', 'user@', 'user @example.com', ''];

      invalidEmails.forEach((email) => {
        const result = Email.create(email);
        expect(result.isFailure).toBe(true);
      });
    });
  });

  describe('Value Object - LeadScore', () => {
    it('should create valid lead score', () => {
      const result = LeadScore.create(75, 0.9, 'v1.0.0');
      expect(result.isSuccess).toBe(true);

      const score = result.value;
      expect(score.value).toBe(75);
      expect(score.confidence).toBe(0.9);
      expect(score.tier).toBe('WARM');
    });

    it('should calculate correct tier - COLD', () => {
      const score = LeadScore.create(30, 0.8, 'v1.0.0').value;
      expect(score.tier).toBe('COLD');
    });

    it('should calculate correct tier - WARM', () => {
      const score = LeadScore.create(60, 0.8, 'v1.0.0').value;
      expect(score.tier).toBe('WARM');
    });

    it('should calculate correct tier - HOT', () => {
      const score = LeadScore.create(85, 0.8, 'v1.0.0').value;
      expect(score.tier).toBe('HOT');
    });

    it('should reject score below 0', () => {
      const result = LeadScore.create(-10, 0.8, 'v1.0.0');
      expect(result.isFailure).toBe(true);
    });

    it('should reject score above 100', () => {
      const result = LeadScore.create(150, 0.8, 'v1.0.0');
      expect(result.isFailure).toBe(true);
    });

    it('should reject confidence below 0', () => {
      const result = LeadScore.create(75, -0.1, 'v1.0.0');
      expect(result.isFailure).toBe(true);
    });

    it('should reject confidence above 1', () => {
      const result = LeadScore.create(75, 1.5, 'v1.0.0');
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Business Logic - updateScore()', () => {
    let lead: Lead;

    beforeEach(() => {
      const result = Lead.create({
        email: 'score@example.com',
        ownerId: 'owner-123',
      });
      lead = result.value;
      lead.clearDomainEvents();
    });

    it('should update lead score successfully', () => {
      // Act
      const result = lead.updateScore(75, 0.9, 'v1.0.0');

      // Assert
      expect(result.isSuccess).toBe(true);
      expect(lead.score.value).toBe(75);
      expect(lead.score.confidence).toBe(0.9);
      expect(lead.score.tier).toBe('WARM');
    });

    it('should emit LeadScoredEvent', () => {
      // Act
      lead.updateScore(85, 0.95, 'v2.0.0');

      // Assert
      const events = lead.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadScoredEvent);

      const event = events[0] as LeadScoredEvent;
      expect(event.leadId).toBe(lead.id);
      expect(event.newScore.value).toBe(85);
      expect(event.modelVersion).toBe('v2.0.0');
    });

    it('should fail with invalid score', () => {
      // Act
      const result = lead.updateScore(150, 0.8, 'v1.0.0');

      // Assert
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LEAD_SCORE');
    });
  });

  describe('Business Logic - changeStatus()', () => {
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
      // Act
      const result = lead.changeStatus('CONTACTED', 'user-123');

      // Assert
      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe('CONTACTED');
    });

    it('should emit LeadStatusChangedEvent', () => {
      // Act
      lead.changeStatus('QUALIFIED', 'user-456');

      // Assert
      const events = lead.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadStatusChangedEvent);

      const event = events[0] as LeadStatusChangedEvent;
      expect(event.previousStatus).toBe('NEW');
      expect(event.newStatus).toBe('QUALIFIED');
      expect(event.changedBy).toBe('user-456');
    });

    it('should prevent status change of converted lead', () => {
      // Arrange
      lead.convert('contact-123', null, 'user-789');
      lead.clearDomainEvents();

      // Act
      const result = lead.changeStatus('QUALIFIED', 'user-999');

      // Assert
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(LeadAlreadyConvertedError);
    });
  });

  describe('Business Logic - qualify()', () => {
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
      // Act
      const result = lead.qualify('user-123', 'Strong product fit');

      // Assert
      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe('QUALIFIED');
      expect(lead.isQualified).toBe(true);
    });

    it('should emit LeadQualifiedEvent', () => {
      // Act
      lead.qualify('user-789', 'High budget');

      // Assert
      const events = lead.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadQualifiedEvent);

      const event = events[0] as LeadQualifiedEvent;
      expect(event.qualifiedBy).toBe('user-789');
      expect(event.reason).toBe('High budget');
    });

    it('should not qualify an UNQUALIFIED lead', () => {
      // Arrange
      lead.changeStatus('UNQUALIFIED', 'user-123');

      // Act
      const result = lead.qualify('user-456', 'Reconsidered');

      // Assert
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(LeadCannotBeQualifiedError);
    });

    it('should not qualify a CONVERTED lead', () => {
      // Arrange
      lead.convert('contact-123', null, 'user-789');

      // Act
      const result = lead.qualify('user-999', 'Already converted');

      // Assert
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(LeadAlreadyConvertedError);
    });
  });

  describe('Business Logic - convert()', () => {
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
      // Act
      const result = lead.convert('contact-123', 'account-456', 'user-789');

      // Assert
      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe('CONVERTED');
      expect(lead.isConverted).toBe(true);
    });

    it('should convert lead without account', () => {
      // Act
      const result = lead.convert('contact-999', null, 'user-111');

      // Assert
      expect(result.isSuccess).toBe(true);
      expect(lead.isConverted).toBe(true);
    });

    it('should emit LeadConvertedEvent', () => {
      // Act
      lead.convert('contact-555', 'account-666', 'user-777');

      // Assert
      const events = lead.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadConvertedEvent);

      const event = events[0] as LeadConvertedEvent;
      expect(event.contactId).toBe('contact-555');
      expect(event.accountId).toBe('account-666');
      expect(event.convertedBy).toBe('user-777');
    });

    it('should prevent double conversion', () => {
      // Arrange
      lead.convert('contact-123', 'account-456', 'user-789');

      // Act
      const result = lead.convert('contact-999', 'account-111', 'user-222');

      // Assert
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(LeadAlreadyConvertedError);
    });
  });

  describe('Business Logic - updateContactInfo()', () => {
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
      // Act
      lead.updateContactInfo({
        firstName: 'Jane',
        company: 'New Corp',
        title: 'CEO',
      });

      // Assert
      expect(lead.firstName).toBe('Jane');
      expect(lead.lastName).toBe('Doe'); // Unchanged
      expect(lead.company).toBe('New Corp');
      expect(lead.title).toBe('CEO');
    });

    it('should update phone number', () => {
      // Act
      lead.updateContactInfo({
        phone: '+1-555-9999',
      });

      // Assert
      expect(lead.phone).toBe('+1-555-9999');
    });
  });

  describe('Domain Events', () => {
    it('should accumulate multiple domain events', () => {
      // Arrange
      const result = Lead.create({
        email: 'events@example.com',
        ownerId: 'owner-123',
      });
      const lead = result.value;

      // Act & Assert
      expect(lead.getDomainEvents()).toHaveLength(1); // Creation event

      lead.updateScore(75, 0.9, 'v1.0.0');
      expect(lead.getDomainEvents()).toHaveLength(2);

      lead.changeStatus('CONTACTED', 'user-123');
      expect(lead.getDomainEvents()).toHaveLength(3);

      lead.qualify('user-456', 'Good fit');
      expect(lead.getDomainEvents()).toHaveLength(4);
    });

    it('should clear domain events', () => {
      // Arrange
      const result = Lead.create({
        email: 'clear@example.com',
        ownerId: 'owner-123',
      });
      const lead = result.value;

      // Act
      lead.clearDomainEvents();

      // Assert
      expect(lead.getDomainEvents()).toHaveLength(0);
    });
  });

  describe('Serialization', () => {
    it('should serialize lead to JSON', () => {
      // Arrange
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

      // Act
      const json = lead.toJSON();

      // Assert
      expect(json).toHaveProperty('id');
      expect(json.email).toBe('json@example.com');
      expect(json.firstName).toBe('JSON');
      expect(json.source).toBe('SOCIAL');
      expect(json.score).toMatchObject({
        score: 65,
        confidence: 0.85,
        tier: 'WARM',
      });
    });
  });
});
