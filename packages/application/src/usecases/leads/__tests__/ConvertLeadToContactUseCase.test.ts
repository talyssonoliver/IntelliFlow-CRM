/**
 * ConvertLeadToContactUseCase Tests
 *
 * FLOW-006: Lead to Contact Conversion Logic
 * Task: IFC-061
 *
 * Tests for converting a lead to a contact with:
 * - All lead data preserved in contact
 * - Optional account creation
 * - Audit trail (domain events)
 * - Performance target: <200ms
 * - Data integrity: 100%
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConvertLeadToContactUseCase,
  ConvertLeadToContactInput,
  ConvertLeadToContactOutput,
} from '../ConvertLeadToContactUseCase';
import { Lead, Contact, Account, LeadConvertedEvent, LeadConversionAudit } from '@intelliflow/domain';
import { Result, DomainError } from '@intelliflow/domain';
import { LeadRepository, ContactRepository, AccountRepository, LeadConversionAuditRepository } from '../../../ports/repositories';
import { EventBusPort } from '../../../ports/external';
import { ConversionSnapshot } from '../ConversionSnapshot';

// =============================================================================
// Mock Implementations
// =============================================================================

class MockLeadRepository implements Partial<LeadRepository> {
  private leads: Map<string, Lead> = new Map();

  async save(lead: Lead): Promise<void> {
    this.leads.set(lead.id.value, lead);
  }

  async findById(id: { value: string }): Promise<Lead | null> {
    return this.leads.get(id.value) ?? null;
  }

  setLead(lead: Lead): void {
    this.leads.set(lead.id.value, lead);
  }
}

class MockContactRepository implements Partial<ContactRepository> {
  private contacts: Map<string, Contact> = new Map();
  savedContact: Contact | null = null;

  async save(contact: Contact): Promise<void> {
    this.contacts.set(contact.id.value, contact);
    this.savedContact = contact;
  }

  async findById(id: { value: string }): Promise<Contact | null> {
    return this.contacts.get(id.value) ?? null;
  }

  async findByEmail(): Promise<Contact | null> {
    return null;
  }
}

class MockAccountRepository implements Partial<AccountRepository> {
  private accounts: Map<string, Account> = new Map();
  savedAccount: Account | null = null;

  async save(account: Account): Promise<void> {
    this.accounts.set(account.id.value, account);
    this.savedAccount = account;
  }

  async findById(id: { value: string }): Promise<Account | null> {
    return this.accounts.get(id.value) ?? null;
  }

  async findByName(name: string): Promise<Account[]> {
    const results: Account[] = [];
    for (const account of this.accounts.values()) {
      if (account.name === name) {
        results.push(account);
      }
    }
    return results;
  }

  setAccount(account: Account): void {
    this.accounts.set(account.id.value, account);
  }
}

class MockEventBus implements EventBusPort {
  publishedEvents: unknown[] = [];

  async publish(event: unknown): Promise<void> {
    this.publishedEvents.push(event);
  }

  async publishAll(events: unknown[]): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clearEvents(): void {
    this.publishedEvents = [];
  }
}

class MockLeadConversionAuditRepository implements Partial<LeadConversionAuditRepository> {
  private audits: Map<string, LeadConversionAudit> = new Map();
  savedAudit: LeadConversionAudit | null = null;

  async save(audit: LeadConversionAudit): Promise<void> {
    this.audits.set(audit.idempotencyKey, audit);
    this.savedAudit = audit;
  }

  async findByIdempotencyKey(key: string): Promise<LeadConversionAudit | null> {
    return this.audits.get(key) ?? null;
  }

  async findByLeadId(leadId: string, tenantId: string): Promise<LeadConversionAudit | null> {
    for (const audit of this.audits.values()) {
      if (audit.leadId === leadId && audit.tenantId === tenantId) {
        return audit;
      }
    }
    return null;
  }

  setAudit(audit: LeadConversionAudit): void {
    this.audits.set(audit.idempotencyKey, audit);
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe('ConvertLeadToContactUseCase', () => {
  let leadRepository: MockLeadRepository;
  let contactRepository: MockContactRepository;
  let accountRepository: MockAccountRepository;
  let conversionAuditRepository: MockLeadConversionAuditRepository;
  let eventBus: MockEventBus;
  let useCase: ConvertLeadToContactUseCase;

  beforeEach(() => {
    leadRepository = new MockLeadRepository();
    contactRepository = new MockContactRepository();
    accountRepository = new MockAccountRepository();
    conversionAuditRepository = new MockLeadConversionAuditRepository();
    eventBus = new MockEventBus();
    useCase = new ConvertLeadToContactUseCase(
      leadRepository as unknown as LeadRepository,
      contactRepository as unknown as ContactRepository,
      accountRepository as unknown as AccountRepository,
      conversionAuditRepository as unknown as LeadConversionAuditRepository,
      eventBus
    );
  });

  describe('Data Preservation (100% integrity)', () => {
    it('should preserve all lead data in created contact', async () => {
      const leadResult = Lead.create({
        email: 'john.doe@company.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'ACME Corp',
        title: 'Sales Manager',
        phone: '+1234567890',
        source: 'WEBSITE',
        ownerId: 'owner-123',
        tenantId: 'tenant-456',
      });
      expect(leadResult.isSuccess).toBe(true);
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep-1',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const output = result.value;

      // Verify contact was created with all lead data
      const savedContact = contactRepository.savedContact;
      expect(savedContact).not.toBeNull();
      expect(savedContact!.email.value).toBe('john.doe@company.com');
      expect(savedContact!.firstName).toBe('John');
      expect(savedContact!.lastName).toBe('Doe');
      expect(savedContact!.title).toBe('Sales Manager');
      expect(savedContact!.phone?.value).toBe('+1234567890');
      expect(savedContact!.ownerId).toBe('owner-123');
      expect(savedContact!.tenantId).toBe('tenant-456');
      expect(savedContact!.leadId).toBe(lead.id.value);
    });

    it('should handle lead with minimal data', async () => {
      const leadResult = Lead.create({
        email: 'minimal@example.com',
        ownerId: 'owner-min',
        tenantId: 'tenant-min',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const savedContact = contactRepository.savedContact;
      expect(savedContact!.email.value).toBe('minimal@example.com');
      expect(savedContact!.firstName).toBe('Unknown'); // Default for missing firstName
      expect(savedContact!.lastName).toBe('Unknown'); // Default for missing lastName
    });
  });

  describe('Account Creation', () => {
    it('should create new account when accountName is provided', async () => {
      const leadResult = Lead.create({
        email: 'test@newcompany.com',
        firstName: 'Jane',
        lastName: 'Smith',
        ownerId: 'owner-acc',
        tenantId: 'tenant-acc',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        accountName: 'New Company Inc',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).not.toBeNull();
      expect(accountRepository.savedAccount).not.toBeNull();
      expect(accountRepository.savedAccount!.name).toBe('New Company Inc');
    });

    it('should link to existing account when accountName matches', async () => {
      // Create existing account
      const existingAccountResult = Account.create({
        name: 'Existing Corp',
        ownerId: 'owner-exist',
        tenantId: 'tenant-exist',
      });
      const existingAccount = existingAccountResult.value;
      accountRepository.setAccount(existingAccount);

      const leadResult = Lead.create({
        email: 'test@existing.com',
        firstName: 'Bob',
        lastName: 'Jones',
        ownerId: 'owner-exist',
        tenantId: 'tenant-exist',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        accountName: 'Existing Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBe(existingAccount.id.value);
    });

    it('should not create account when accountName is not provided', async () => {
      const leadResult = Lead.create({
        email: 'noaccount@example.com',
        firstName: 'No',
        lastName: 'Account',
        ownerId: 'owner-no',
        tenantId: 'tenant-no',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBeNull();
      expect(accountRepository.savedAccount).toBeNull();
    });
  });

  describe('Lead Status Update', () => {
    it('should mark lead as CONVERTED', async () => {
      const leadResult = Lead.create({
        email: 'convert@example.com',
        firstName: 'Convert',
        lastName: 'Me',
        ownerId: 'owner-conv',
        tenantId: 'tenant-conv',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadStatus).toBe('CONVERTED');

      // Verify lead was updated in repository
      const updatedLead = await leadRepository.findById({ value: lead.id.value });
      expect(updatedLead!.status).toBe('CONVERTED');
      expect(updatedLead!.isConverted).toBe(true);
    });

    it('should fail when lead is already converted', async () => {
      const leadResult = Lead.create({
        email: 'already@converted.com',
        firstName: 'Already',
        lastName: 'Converted',
        ownerId: 'owner-alr',
        tenantId: 'tenant-alr',
      });
      const lead = leadResult.value;
      lead.convert('existing-contact', null, 'previous-converter');
      lead.clearDomainEvents();
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_ALREADY_CONVERTED');
    });
  });

  describe('Audit Trail (Domain Events)', () => {
    it('should publish LeadConvertedEvent', async () => {
      const leadResult = Lead.create({
        email: 'audit@example.com',
        firstName: 'Audit',
        lastName: 'Trail',
        ownerId: 'owner-aud',
        tenantId: 'tenant-aud',
      });
      const lead = leadResult.value;
      lead.clearDomainEvents();
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep-audit',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);

      // Should have LeadConvertedEvent
      const leadEvents = eventBus.publishedEvents.filter(
        (e: unknown) => (e as { eventType?: string }).eventType === 'lead.converted'
      );
      expect(leadEvents.length).toBeGreaterThan(0);
    });

    it('should include conversion metadata in output', async () => {
      const leadResult = Lead.create({
        email: 'meta@example.com',
        firstName: 'Meta',
        lastName: 'Data',
        ownerId: 'owner-meta',
        tenantId: 'tenant-meta',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep-meta',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadId).toBe(lead.id.value);
      expect(result.value.contactId).toBeDefined();
      expect(result.value.convertedBy).toBe('sales-rep-meta');
      expect(result.value.convertedAt).toBeInstanceOf(Date);
    });
  });

  describe('Validation', () => {
    it('should fail when lead ID is invalid', async () => {
      const input: ConvertLeadToContactInput = {
        leadId: 'not-a-valid-uuid',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid');
    });

    it('should fail when lead is not found', async () => {
      const input: ConvertLeadToContactInput = {
        leadId: '00000000-0000-0000-0000-000000000000',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should fail when convertedBy is empty', async () => {
      const leadResult = Lead.create({
        email: 'empty@converter.com',
        firstName: 'Empty',
        lastName: 'Converter',
        ownerId: 'owner-emp',
        tenantId: 'tenant-emp',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: '',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('convertedBy');
    });
  });

  describe('Performance', () => {
    it('should complete conversion in under 200ms', async () => {
      const leadResult = Lead.create({
        email: 'perf@example.com',
        firstName: 'Performance',
        lastName: 'Test',
        ownerId: 'owner-perf',
        tenantId: 'tenant-perf',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        accountName: 'Perf Corp',
        convertedBy: 'sales-rep-perf',
      };

      const startTime = performance.now();
      const result = await useCase.execute(input);
      const endTime = performance.now();

      expect(result.isSuccess).toBe(true);
      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe('Qualified Lead Conversion', () => {
    it('should convert a QUALIFIED lead', async () => {
      const leadResult = Lead.create({
        email: 'qualified@example.com',
        firstName: 'Qualified',
        lastName: 'Lead',
        ownerId: 'owner-qual',
        tenantId: 'tenant-qual',
      });
      const lead = leadResult.value;
      lead.qualify('qualifier', 'Good fit');
      lead.clearDomainEvents();
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadStatus).toBe('CONVERTED');
    });

    it('should convert leads from any valid status', async () => {
      const statuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING'] as const;

      for (const status of statuses) {
        const leadResult = Lead.create({
          email: `${status.toLowerCase()}@example.com`,
          firstName: status,
          lastName: 'Lead',
          ownerId: 'owner-status',
          tenantId: 'tenant-status',
        });
        const lead = leadResult.value;
        if (status !== 'NEW') {
          lead.changeStatus(status, 'test');
        }
        lead.clearDomainEvents();
        leadRepository.setLead(lead);

        const input: ConvertLeadToContactInput = {
          leadId: lead.id.value,
          convertedBy: 'sales-rep',
        };

        const result = await useCase.execute(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.leadStatus).toBe('CONVERTED');
      }
    });
  });

  describe('Idempotency', () => {
    it('should return existing result for duplicate idempotency key', async () => {
      const leadResult = Lead.create({
        email: 'idempotent@example.com',
        firstName: 'Idempotent',
        lastName: 'Test',
        ownerId: 'owner-idem',
        tenantId: 'tenant-idem',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      // Create existing audit record
      const existingAudit = LeadConversionAudit.create({
        leadId: lead.id.value,
        contactId: 'existing-contact-id',
        accountId: null,
        tenantId: 'tenant-idem',
        convertedBy: 'sales-rep',
        conversionSnapshot: { email: 'idempotent@example.com' },
        idempotencyKey: 'custom-idem-key',
      });
      conversionAuditRepository.setAudit(existingAudit);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep',
        idempotencyKey: 'custom-idem-key',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBe('existing-contact-id');
      // Contact should NOT be created again
      expect(contactRepository.savedContact).toBeNull();
    });

    it('should generate idempotency key if not provided', async () => {
      const leadResult = Lead.create({
        email: 'autogen@example.com',
        firstName: 'Auto',
        lastName: 'Gen',
        ownerId: 'owner-auto',
        tenantId: 'tenant-auto',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep-auto',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(conversionAuditRepository.savedAudit).not.toBeNull();
      expect(conversionAuditRepository.savedAudit!.idempotencyKey).toContain(lead.id.value);
    });
  });

  describe('ConversionSnapshot Creation', () => {
    it('should create snapshot with all lead data', async () => {
      const leadResult = Lead.create({
        email: 'snapshot@example.com',
        firstName: 'Snapshot',
        lastName: 'Test',
        company: 'Snapshot Corp',
        title: 'CEO',
        phone: '+1987654321',
        source: 'REFERRAL',
        ownerId: 'owner-snap',
        tenantId: 'tenant-snap',
      });
      const lead = leadResult.value;
      lead.updateScore(75, 0.85, 'model-v2');
      lead.clearDomainEvents();
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(conversionAuditRepository.savedAudit).not.toBeNull();

      const snapshot = conversionAuditRepository.savedAudit!.conversionSnapshot;
      expect(snapshot.email).toBe('snapshot@example.com');
      expect(snapshot.firstName).toBe('Snapshot');
      expect(snapshot.lastName).toBe('Test');
      expect(snapshot.company).toBe('Snapshot Corp');
      expect(snapshot.source).toBe('REFERRAL');
      expect(snapshot.scoreValue).toBe(75);
      expect(snapshot.scoreConfidence).toBe(0.85);
    });

    it('should include snapshot in output', async () => {
      const leadResult = Lead.create({
        email: 'output@example.com',
        firstName: 'Output',
        lastName: 'Test',
        ownerId: 'owner-out',
        tenantId: 'tenant-out',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.conversionSnapshot).toBeDefined();
      expect(result.value.conversionSnapshot.email).toBe('output@example.com');
    });
  });

  describe('Contact Email Conflict', () => {
    it('should skip creation with SKIP strategy and return error', async () => {
      const leadResult = Lead.create({
        email: 'existing@example.com',
        firstName: 'Existing',
        lastName: 'Contact',
        ownerId: 'owner-exist',
        tenantId: 'tenant-exist',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      // Create existing contact with same email
      const existingContactResult = Contact.create({
        email: 'existing@example.com',
        firstName: 'Already',
        lastName: 'Exists',
        ownerId: 'owner-exist',
        tenantId: 'tenant-exist',
      });
      const existingContact = existingContactResult.value;
      contactRepository.savedContact = existingContact;

      // Override findByEmail to return existing contact
      const originalFindByEmail = contactRepository.findByEmail.bind(contactRepository);
      contactRepository.findByEmail = async () => existingContact;

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep',
        mergeStrategy: 'SKIP',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('CONTACT_EMAIL_EXISTS');

      // Restore original
      contactRepository.findByEmail = originalFindByEmail;
    });
  });

  describe('Audit Record Persistence', () => {
    it('should persist audit record in same transaction', async () => {
      const leadResult = Lead.create({
        email: 'auditpersist@example.com',
        firstName: 'Audit',
        lastName: 'Persist',
        ownerId: 'owner-ap',
        tenantId: 'tenant-ap',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToContactInput = {
        leadId: lead.id.value,
        convertedBy: 'sales-rep-ap',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(conversionAuditRepository.savedAudit).not.toBeNull();
      expect(conversionAuditRepository.savedAudit!.leadId).toBe(lead.id.value);
      expect(conversionAuditRepository.savedAudit!.contactId).toBe(result.value.contactId);
      expect(conversionAuditRepository.savedAudit!.convertedBy).toBe('sales-rep-ap');
    });
  });
});
