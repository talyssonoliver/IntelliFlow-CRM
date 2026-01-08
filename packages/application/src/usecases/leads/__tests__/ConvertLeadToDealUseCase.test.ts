/**
 * ConvertLeadToDealUseCase Tests
 *
 * FLOW-006: Lead to Deal Conversion Logic
 * Task: IFC-062
 *
 * Tests for converting a lead to a deal/opportunity with:
 * - Pipeline assignment (stage, probability)
 * - Account creation/linking (required)
 * - Optional contact creation
 * - Audit trail (domain events)
 * - Performance target: <200ms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConvertLeadToDealUseCase,
  ConvertLeadToDealInput,
} from '../ConvertLeadToDealUseCase';
import { Lead, Contact, Account, Opportunity } from '@intelliflow/domain';
import {
  LeadRepository,
  ContactRepository,
  AccountRepository,
  OpportunityRepository,
} from '../../../ports/repositories';
import { EventBusPort } from '../../../ports/external';

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

class MockOpportunityRepository implements Partial<OpportunityRepository> {
  private opportunities: Map<string, Opportunity> = new Map();
  savedOpportunity: Opportunity | null = null;

  async save(opportunity: Opportunity): Promise<void> {
    this.opportunities.set(opportunity.id.value, opportunity);
    this.savedOpportunity = opportunity;
  }

  async findById(id: { value: string }): Promise<Opportunity | null> {
    return this.opportunities.get(id.value) ?? null;
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

// =============================================================================
// Test Suite
// =============================================================================

describe('ConvertLeadToDealUseCase', () => {
  let leadRepository: MockLeadRepository;
  let contactRepository: MockContactRepository;
  let accountRepository: MockAccountRepository;
  let opportunityRepository: MockOpportunityRepository;
  let eventBus: MockEventBus;
  let useCase: ConvertLeadToDealUseCase;

  beforeEach(() => {
    leadRepository = new MockLeadRepository();
    contactRepository = new MockContactRepository();
    accountRepository = new MockAccountRepository();
    opportunityRepository = new MockOpportunityRepository();
    eventBus = new MockEventBus();
    useCase = new ConvertLeadToDealUseCase(
      leadRepository as unknown as LeadRepository,
      contactRepository as unknown as ContactRepository,
      accountRepository as unknown as AccountRepository,
      opportunityRepository as unknown as OpportunityRepository,
      eventBus
    );
  });

  describe('Opportunity Creation', () => {
    it('should create opportunity from lead with provided deal value', async () => {
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

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 50000,
        accountName: 'ACME Corp',
        convertedBy: 'sales-rep-1',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const output = result.value;

      // Verify opportunity was created
      const savedOpportunity = opportunityRepository.savedOpportunity;
      expect(savedOpportunity).not.toBeNull();
      expect(savedOpportunity!.value).toBe(50000);
      expect(savedOpportunity!.ownerId).toBe('owner-123');
      expect(savedOpportunity!.tenantId).toBe('tenant-456');
      expect(output.opportunityId).toBe(savedOpportunity!.id.value);
    });

    it('should auto-generate deal name from lead company and name if not provided', async () => {
      const leadResult = Lead.create({
        email: 'jane@bigcorp.com',
        firstName: 'Jane',
        lastName: 'Smith',
        company: 'BigCorp Inc',
        ownerId: 'owner-auto',
        tenantId: 'tenant-auto',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 25000,
        accountName: 'BigCorp Inc',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const savedOpportunity = opportunityRepository.savedOpportunity;
      expect(savedOpportunity!.name).toContain('BigCorp Inc');
    });

    it('should use provided deal name when specified', async () => {
      const leadResult = Lead.create({
        email: 'test@customdeal.com',
        firstName: 'Test',
        lastName: 'User',
        company: 'Custom Deal Co',
        ownerId: 'owner-custom',
        tenantId: 'tenant-custom',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealName: 'Enterprise License Deal 2024',
        dealValue: 100000,
        accountName: 'Custom Deal Co',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const savedOpportunity = opportunityRepository.savedOpportunity;
      expect(savedOpportunity!.name).toBe('Enterprise License Deal 2024');
    });
  });

  describe('Pipeline Assignment', () => {
    it('should set default stage to PROSPECTING', async () => {
      const leadResult = Lead.create({
        email: 'pipeline@example.com',
        firstName: 'Pipeline',
        lastName: 'Test',
        company: 'Pipeline Corp',
        ownerId: 'owner-pipe',
        tenantId: 'tenant-pipe',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 30000,
        accountName: 'Pipeline Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('PROSPECTING');
      expect(opportunityRepository.savedOpportunity!.stage).toBe('PROSPECTING');
    });

    it('should set default probability to 10%', async () => {
      const leadResult = Lead.create({
        email: 'prob@example.com',
        firstName: 'Prob',
        lastName: 'Test',
        company: 'Prob Corp',
        ownerId: 'owner-prob',
        tenantId: 'tenant-prob',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 20000,
        accountName: 'Prob Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.probability).toBe(10);
      expect(opportunityRepository.savedOpportunity!.probability).toBe(10);
    });
  });

  describe('Account Handling (Required)', () => {
    it('should create new account when accountName is provided', async () => {
      const leadResult = Lead.create({
        email: 'newaccount@example.com',
        firstName: 'New',
        lastName: 'Account',
        company: 'New Account Corp',
        ownerId: 'owner-newacc',
        tenantId: 'tenant-newacc',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 15000,
        accountName: 'New Account Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).not.toBeNull();
      expect(accountRepository.savedAccount).not.toBeNull();
      expect(accountRepository.savedAccount!.name).toBe('New Account Corp');
    });

    it('should link to existing account when accountName matches', async () => {
      // Create existing account
      const existingAccountResult = Account.create({
        name: 'Existing Account Corp',
        ownerId: 'owner-exist',
        tenantId: 'tenant-exist',
      });
      const existingAccount = existingAccountResult.value;
      accountRepository.setAccount(existingAccount);

      const leadResult = Lead.create({
        email: 'existing@example.com',
        firstName: 'Existing',
        lastName: 'Account',
        company: 'Existing Account Corp',
        ownerId: 'owner-exist',
        tenantId: 'tenant-exist',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 40000,
        accountName: 'Existing Account Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBe(existingAccount.id.value);
    });

    it('should use lead company as account name when accountName not provided', async () => {
      const leadResult = Lead.create({
        email: 'autocompany@example.com',
        firstName: 'Auto',
        lastName: 'Company',
        company: 'Auto Company Ltd',
        ownerId: 'owner-autocomp',
        tenantId: 'tenant-autocomp',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 35000,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(accountRepository.savedAccount!.name).toBe('Auto Company Ltd');
    });

    it('should fail when lead has no company and accountName not provided', async () => {
      const leadResult = Lead.create({
        email: 'nocompany@example.com',
        firstName: 'No',
        lastName: 'Company',
        ownerId: 'owner-nocomp',
        tenantId: 'tenant-nocomp',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 10000,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('account');
    });
  });

  describe('Contact Creation', () => {
    it('should create contact by default (createContact = true)', async () => {
      const leadResult = Lead.create({
        email: 'withcontact@example.com',
        firstName: 'With',
        lastName: 'Contact',
        company: 'Contact Corp',
        title: 'Manager',
        phone: '+1555555555',
        ownerId: 'owner-contact',
        tenantId: 'tenant-contact',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 25000,
        accountName: 'Contact Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).not.toBeNull();
      expect(contactRepository.savedContact).not.toBeNull();
      expect(contactRepository.savedContact!.email.value).toBe('withcontact@example.com');
    });

    it('should not create contact when createContact = false', async () => {
      const leadResult = Lead.create({
        email: 'nocontact@example.com',
        firstName: 'No',
        lastName: 'Contact',
        company: 'NoContact Corp',
        ownerId: 'owner-nocontact',
        tenantId: 'tenant-nocontact',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 20000,
        accountName: 'NoContact Corp',
        createContact: false,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBeNull();
      expect(contactRepository.savedContact).toBeNull();
    });
  });

  describe('Lead Status Update', () => {
    it('should mark lead as CONVERTED', async () => {
      const leadResult = Lead.create({
        email: 'convert@example.com',
        firstName: 'Convert',
        lastName: 'Me',
        company: 'Convert Corp',
        ownerId: 'owner-conv',
        tenantId: 'tenant-conv',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 55000,
        accountName: 'Convert Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);

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
        company: 'Already Converted Corp',
        ownerId: 'owner-alr',
        tenantId: 'tenant-alr',
      });
      const lead = leadResult.value;
      lead.convert('existing-contact', null, 'previous-converter');
      lead.clearDomainEvents();
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 30000,
        accountName: 'Already Converted Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_ALREADY_CONVERTED');
    });
  });

  describe('Audit Trail (Domain Events)', () => {
    it('should publish domain events for audit trail', async () => {
      const leadResult = Lead.create({
        email: 'audit@example.com',
        firstName: 'Audit',
        lastName: 'Trail',
        company: 'Audit Corp',
        ownerId: 'owner-aud',
        tenantId: 'tenant-aud',
      });
      const lead = leadResult.value;
      lead.clearDomainEvents();
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 45000,
        accountName: 'Audit Corp',
        convertedBy: 'sales-rep-audit',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);

      // Should have domain events published
      expect(eventBus.publishedEvents.length).toBeGreaterThan(0);

      // Should include LeadConvertedEvent
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
        company: 'Meta Corp',
        ownerId: 'owner-meta',
        tenantId: 'tenant-meta',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 60000,
        accountName: 'Meta Corp',
        convertedBy: 'sales-rep-meta',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadId).toBe(lead.id.value);
      expect(result.value.opportunityId).toBeDefined();
      expect(result.value.accountId).toBeDefined();
      expect(result.value.convertedBy).toBe('sales-rep-meta');
      expect(result.value.convertedAt).toBeInstanceOf(Date);
    });
  });

  describe('Validation', () => {
    it('should fail when lead ID is invalid', async () => {
      const input: ConvertLeadToDealInput = {
        leadId: 'not-a-valid-uuid',
        dealValue: 10000,
        accountName: 'Test Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid');
    });

    it('should fail when lead is not found', async () => {
      const input: ConvertLeadToDealInput = {
        leadId: '00000000-0000-0000-0000-000000000000',
        dealValue: 10000,
        accountName: 'Test Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should fail when convertedBy is empty', async () => {
      const leadResult = Lead.create({
        email: 'emptyconverter@example.com',
        firstName: 'Empty',
        lastName: 'Converter',
        company: 'Empty Corp',
        ownerId: 'owner-emp',
        tenantId: 'tenant-emp',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 10000,
        accountName: 'Empty Corp',
        convertedBy: '',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('convertedBy');
    });

    it('should fail when dealValue is zero or negative', async () => {
      const leadResult = Lead.create({
        email: 'zeroval@example.com',
        firstName: 'Zero',
        lastName: 'Value',
        company: 'Zero Corp',
        ownerId: 'owner-zero',
        tenantId: 'tenant-zero',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 0,
        accountName: 'Zero Corp',
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('value');
    });
  });

  describe('Performance', () => {
    it('should complete conversion in under 200ms', async () => {
      const leadResult = Lead.create({
        email: 'perf@example.com',
        firstName: 'Performance',
        lastName: 'Test',
        company: 'Perf Corp',
        ownerId: 'owner-perf',
        tenantId: 'tenant-perf',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 75000,
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

  describe('Expected Close Date', () => {
    it('should set expected close date when provided', async () => {
      const leadResult = Lead.create({
        email: 'closedate@example.com',
        firstName: 'Close',
        lastName: 'Date',
        company: 'CloseDate Corp',
        ownerId: 'owner-close',
        tenantId: 'tenant-close',
      });
      const lead = leadResult.value;
      leadRepository.setLead(lead);

      const expectedDate = new Date('2025-06-30');
      const input: ConvertLeadToDealInput = {
        leadId: lead.id.value,
        dealValue: 80000,
        accountName: 'CloseDate Corp',
        expectedCloseDate: expectedDate,
        convertedBy: 'sales-rep',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const savedOpportunity = opportunityRepository.savedOpportunity;
      expect(savedOpportunity!.expectedCloseDate).toEqual(expectedDate);
    });
  });
});
