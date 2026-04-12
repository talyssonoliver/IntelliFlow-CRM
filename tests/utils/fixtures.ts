/**
 * Test Data Fixtures for IntelliFlow CRM
 *
 * This module provides factory functions for creating test data.
 * Use these fixtures to generate consistent, realistic test data across your test suite.
 *
 * Benefits:
 * - Consistent test data structure
 * - Easy customization with overrides
 * - Realistic default values
 * - Type-safe fixtures
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique test ID
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${uuidv4()}`;
}

/**
 * Generate a unique test email
 */
export function generateTestEmail(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@test.example.com`;
}

/**
 * Generate a test phone number (E.164 format)
 */
export function generateTestPhone(): string {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const subscriber = Math.floor(Math.random() * 9000) + 1000;
  return `+1${areaCode}${exchange}${subscriber}`;
}

/**
 * Generate a test company name
 */
export function generateTestCompanyName(): string {
  const prefixes = ['Global', 'Tech', 'Digital', 'Smart', 'Next'];
  const suffixes = ['Solutions', 'Systems', 'Corp', 'Industries', 'Group'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${prefix} ${suffix}`;
}

/**
 * Lead Fixture
 */
export interface LeadFixture {
  id?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  source: 'WEBSITE' | 'REFERRAL' | 'SOCIAL' | 'EMAIL' | 'COLD_CALL' | 'EVENT' | 'OTHER';
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED' | 'LOST';
  score: number;
  scoreConfidence?: number;
  ownerId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Create a test lead with realistic defaults
 */
export function createLeadFixture(overrides: Partial<LeadFixture> = {}): LeadFixture {
  const firstName = overrides.firstName ?? 'John';
  const lastName = overrides.lastName ?? 'Doe';
  const now = new Date();

  return {
    id: generateTestId('lead'),
    email: generateTestEmail('lead'),
    firstName,
    lastName,
    company: generateTestCompanyName(),
    title: 'Product Manager',
    phone: generateTestPhone(),
    source: 'WEBSITE',
    status: 'NEW',
    score: 0,
    scoreConfidence: 0,
    ownerId: generateTestId('user'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create multiple lead fixtures
 */
export function createLeadFixtures(
  count: number,
  overrides: Partial<LeadFixture> = {}
): LeadFixture[] {
  return Array.from({ length: count }, () => createLeadFixture(overrides));
}

/**
 * Contact Fixture
 */
export interface ContactFixture {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  phone?: string;
  accountId?: string;
  ownerId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Create a test contact with realistic defaults
 */
export function createContactFixture(overrides: Partial<ContactFixture> = {}): ContactFixture {
  const now = new Date();

  return {
    id: generateTestId('contact'),
    email: generateTestEmail('contact'),
    firstName: 'Jane',
    lastName: 'Smith',
    company: generateTestCompanyName(),
    title: 'Software Engineer',
    phone: generateTestPhone(),
    accountId: generateTestId('account'),
    ownerId: generateTestId('user'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create multiple contact fixtures
 */
export function createContactFixtures(
  count: number,
  overrides: Partial<ContactFixture> = {}
): ContactFixture[] {
  return Array.from({ length: count }, () => createContactFixture(overrides));
}

/**
 * Account Fixture
 */
export interface AccountFixture {
  id?: string;
  name: string;
  website?: string;
  industry?: string;
  employees?: number;
  annualRevenue?: number;
  ownerId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Create a test account with realistic defaults
 */
export function createAccountFixture(overrides: Partial<AccountFixture> = {}): AccountFixture {
  const now = new Date();

  return {
    id: generateTestId('account'),
    name: generateTestCompanyName(),
    website: 'https://example.com',
    industry: 'Technology',
    employees: 50,
    annualRevenue: 1000000,
    ownerId: generateTestId('user'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create multiple account fixtures
 */
export function createAccountFixtures(
  count: number,
  overrides: Partial<AccountFixture> = {}
): AccountFixture[] {
  return Array.from({ length: count }, () => createAccountFixture(overrides));
}

/**
 * User Fixture
 */
export interface UserFixture {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Create a test user with realistic defaults
 */
export function createUserFixture(overrides: Partial<UserFixture> = {}): UserFixture {
  const now = new Date();

  return {
    id: generateTestId('user'),
    email: generateTestEmail('user'),
    firstName: 'Test',
    lastName: 'User',
    role: 'USER',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create multiple user fixtures
 */
export function createUserFixtures(
  count: number,
  overrides: Partial<UserFixture> = {}
): UserFixture[] {
  return Array.from({ length: count }, () => createUserFixture(overrides));
}

/**
 * Opportunity Fixture
 */
export interface OpportunityFixture {
  id?: string;
  name: string;
  accountId: string;
  contactId?: string;
  amount: number;
  stage:
    | 'PROSPECTING'
    | 'QUALIFICATION'
    | 'PROPOSAL'
    | 'NEGOTIATION'
    | 'CLOSED_WON'
    | 'CLOSED_LOST';
  probability: number;
  expectedCloseDate: Date;
  ownerId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Create a test opportunity with realistic defaults
 */
export function createOpportunityFixture(
  overrides: Partial<OpportunityFixture> = {}
): OpportunityFixture {
  const now = new Date();
  const expectedCloseDate = new Date();
  expectedCloseDate.setMonth(expectedCloseDate.getMonth() + 3);

  return {
    id: generateTestId('opportunity'),
    name: 'Test Deal',
    accountId: generateTestId('account'),
    contactId: generateTestId('contact'),
    amount: 50000,
    stage: 'QUALIFICATION',
    probability: 50,
    expectedCloseDate,
    ownerId: generateTestId('user'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create multiple opportunity fixtures
 */
export function createOpportunityFixtures(
  count: number,
  overrides: Partial<OpportunityFixture> = {}
): OpportunityFixture[] {
  return Array.from({ length: count }, () => createOpportunityFixture(overrides));
}

/**
 * Task Fixture
 */
export interface TaskFixture {
  id?: string;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: Date;
  assignedTo?: string;
  relatedToType?: 'LEAD' | 'CONTACT' | 'ACCOUNT' | 'OPPORTUNITY';
  relatedToId?: string;
  ownerId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Create a test task with realistic defaults
 */
export function createTaskFixture(overrides: Partial<TaskFixture> = {}): TaskFixture {
  const now = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  return {
    id: generateTestId('task'),
    title: 'Follow up with lead',
    description: 'Send follow-up email',
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate,
    assignedTo: generateTestId('user'),
    ownerId: generateTestId('user'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create multiple task fixtures
 */
export function createTaskFixtures(
  count: number,
  overrides: Partial<TaskFixture> = {}
): TaskFixture[] {
  return Array.from({ length: count }, () => createTaskFixture(overrides));
}

/**
 * Lead Score Fixture
 */
export interface LeadScoreFixture {
  leadId: string;
  score: number;
  confidence: number;
  tier: 'COLD' | 'WARM' | 'HOT';
  factors?: Array<{
    name: string;
    impact: number;
    reasoning: string;
  }>;
  modelVersion: string;
  scoredAt?: Date;
}

/**
 * Create a test lead score with realistic defaults
 */
export function createLeadScoreFixture(
  overrides: Partial<LeadScoreFixture> = {}
): LeadScoreFixture {
  const score = overrides.score ?? 75;
  const tier = score >= 80 ? 'HOT' : score >= 50 ? 'WARM' : 'COLD';

  return {
    leadId: generateTestId('lead'),
    score,
    confidence: 0.85,
    tier,
    factors: [
      {
        name: 'Company Size',
        impact: 15,
        reasoning: 'Company has 100+ employees, indicating good fit',
      },
      {
        name: 'Industry Match',
        impact: 20,
        reasoning: 'Industry aligns with our target market',
      },
      {
        name: 'Engagement Level',
        impact: 10,
        reasoning: 'Multiple website visits and content downloads',
      },
    ],
    modelVersion: 'v1.0.0',
    scoredAt: new Date(),
    ...overrides,
  };
}

/**
 * Domain Event Fixture
 */
export interface DomainEventFixture {
  id?: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventData: Record<string, any>;
  version: number;
  occurredAt?: Date;
}

/**
 * Create a test domain event
 */
export function createDomainEventFixture(
  overrides: Partial<DomainEventFixture> = {}
): DomainEventFixture {
  return {
    id: generateTestId('event'),
    aggregateId: generateTestId('aggregate'),
    aggregateType: 'Lead',
    eventType: 'LeadCreated',
    eventData: {},
    version: 1,
    occurredAt: new Date(),
    ...overrides,
  };
}

/**
 * Utility: Create a complete lead lifecycle scenario
 * Returns a set of related fixtures (lead, user, tasks, etc.)
 */
export interface LeadScenario {
  lead: LeadFixture;
  owner: UserFixture;
  tasks: TaskFixture[];
  score?: LeadScoreFixture;
}

export function createLeadScenario(overrides?: {
  lead?: Partial<LeadFixture>;
  owner?: Partial<UserFixture>;
  taskCount?: number;
  includeScore?: boolean;
}): LeadScenario {
  const owner = createUserFixture(overrides?.owner);
  const lead = createLeadFixture({
    ownerId: owner.id!,
    ...overrides?.lead,
  });

  const taskCount = overrides?.taskCount ?? 2;
  const tasks = createTaskFixtures(taskCount, {
    ownerId: owner.id!,
    assignedTo: owner.id!,
    relatedToType: 'LEAD',
    relatedToId: lead.id!,
  });

  const scenario: LeadScenario = {
    lead,
    owner,
    tasks,
  };

  if (overrides?.includeScore) {
    scenario.score = createLeadScoreFixture({
      leadId: lead.id!,
    });
  }

  return scenario;
}
