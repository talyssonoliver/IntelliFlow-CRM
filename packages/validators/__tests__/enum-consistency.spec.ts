/**
 * Architecture Test: Enum Consistency
 *
 * Ensures that validator Zod schemas are derived from domain constants,
 * enforcing the single source of truth pattern for enum values.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Import domain constants
import {
  LEAD_STATUSES,
  LEAD_SOURCES,
  OPPORTUNITY_STAGES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  CASE_STATUSES,
  CASE_PRIORITIES,
  CASE_TASK_STATUSES,
  CASE_REQUIRED_FIELD_KEYS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  SLA_STATUSES,
  CONTACT_TYPES,
  CONTACT_TYPE_REQUIRED_FIELD_KEYS,
  CONTACT_TYPE_OWNER_DEFAULTS,
  EVENT_LOCATION_TYPES,
  EVENT_TYPE_LEAD_SOURCES,
  EVENT_TYPE_REQUIRED_FIELDS,
  DSAR_REQUEST_TYPES,
  DSAR_STATUSES,
} from '@intelliflow/domain';
import { dsarRequestTypeSchema, dsarStatusSchema } from '../src/dsar';
import {
  EVENT_TYPE_COLOR_TOKENS,
  eventLocationTypeSchema,
  eventTypeLeadSourceSchema,
  eventTypeRequiredFieldSchema,
} from '../src/event-types';

// Import validator schemas
import { leadStatusSchema, leadSourceSchema } from '../src/lead';

import { opportunityStageSchema } from '../src/opportunity';

import { taskStatusSchema, taskPrioritySchema } from '../src/task';

import { caseStatusSchema, casePrioritySchema, caseTaskStatusSchema } from '../src/case';

import { caseRequiredFieldKeySchema } from '../src/case-settings';

import { ticketStatusSchema, ticketPrioritySchema, slaStatusSchema } from '../src/ticket';

import { contactTypeSchema } from '../src/contact';

import { TAG_COLOR_TOKENS } from '../src/contact-settings';

import {
  CONTACT_TYPE_COLOR_TOKENS,
  contactTypeRequiredFieldKeySchema,
  contactTypeOwnerDefaultSchema,
} from '../src/contact-types';

describe('Enum Consistency - DRY Architecture', () => {
  describe('Lead enums', () => {
    it('should derive leadStatusSchema from domain LEAD_STATUSES', () => {
      const domainValues = [...LEAD_STATUSES];
      const schemaValues = leadStatusSchema.options;

      expect(schemaValues).toEqual(domainValues);
    });

    it('should derive leadSourceSchema from domain LEAD_SOURCES', () => {
      const domainValues = [...LEAD_SOURCES];
      const schemaValues = leadSourceSchema.options;

      expect(schemaValues).toEqual(domainValues);
    });
  });

  describe('Opportunity enums', () => {
    it('should derive opportunityStageSchema from domain OPPORTUNITY_STAGES', () => {
      const domainValues = [...OPPORTUNITY_STAGES];
      const schemaValues = opportunityStageSchema.options;

      expect(schemaValues).toEqual(domainValues);
    });
  });

  describe('Task enums', () => {
    it('should derive taskStatusSchema from domain TASK_STATUSES', () => {
      const domainValues = [...TASK_STATUSES];
      const schemaValues = taskStatusSchema.options;

      expect(schemaValues).toEqual(domainValues);
    });

    it('should derive taskPrioritySchema from domain TASK_PRIORITIES', () => {
      const domainValues = [...TASK_PRIORITIES];
      const schemaValues = taskPrioritySchema.options;

      expect(schemaValues).toEqual(domainValues);
    });
  });

  describe('Case enums', () => {
    it('should derive caseStatusSchema from domain CASE_STATUSES', () => {
      const domainValues = [...CASE_STATUSES];
      const schemaValues = caseStatusSchema.options;

      expect(schemaValues).toEqual(domainValues);
    });

    it('should derive casePrioritySchema from domain CASE_PRIORITIES', () => {
      const domainValues = [...CASE_PRIORITIES];
      const schemaValues = casePrioritySchema.options;

      expect(schemaValues).toEqual(domainValues);
    });

    it('should derive caseTaskStatusSchema from domain CASE_TASK_STATUSES', () => {
      const domainValues = [...CASE_TASK_STATUSES];
      const schemaValues = caseTaskStatusSchema.options;

      expect(schemaValues).toEqual(domainValues);
    });

    it('should derive caseRequiredFieldKeySchema from domain CASE_REQUIRED_FIELD_KEYS (PG-204)', () => {
      const domainValues = [...CASE_REQUIRED_FIELD_KEYS];
      const schemaValues = caseRequiredFieldKeySchema.options;

      expect(schemaValues).toEqual(domainValues);
    });
  });

  describe('Ticket enums', () => {
    it('should derive ticketStatusSchema from domain TICKET_STATUSES', () => {
      const domainValues = [...TICKET_STATUSES];
      const schemaValues = ticketStatusSchema.options;

      expect(schemaValues).toEqual(domainValues);
    });

    it('should derive ticketPrioritySchema from domain TICKET_PRIORITIES', () => {
      const domainValues = [...TICKET_PRIORITIES];
      const schemaValues = ticketPrioritySchema.options;

      expect(schemaValues).toEqual(domainValues);
    });

    it('should derive slaStatusSchema from domain SLA_STATUSES', () => {
      const domainValues = [...SLA_STATUSES];
      const schemaValues = slaStatusSchema.options;

      expect(schemaValues).toEqual(domainValues);
    });
  });

  describe('Contact type enums (PG-205)', () => {
    it('should keep contactTypeSchema as the six domain seed keys', () => {
      expect(contactTypeSchema.options).toEqual([...CONTACT_TYPES]);
    });

    it('should derive contactTypeRequiredFieldKeySchema from domain CONTACT_TYPE_REQUIRED_FIELD_KEYS', () => {
      expect(contactTypeRequiredFieldKeySchema.options).toEqual([
        ...CONTACT_TYPE_REQUIRED_FIELD_KEYS,
      ]);
    });

    it('should derive contactTypeOwnerDefaultSchema from domain CONTACT_TYPE_OWNER_DEFAULTS', () => {
      expect(contactTypeOwnerDefaultSchema.options).toEqual([...CONTACT_TYPE_OWNER_DEFAULTS]);
    });

    it('should use the contact tag colour tokens for contact types', () => {
      expect([...CONTACT_TYPE_COLOR_TOKENS]).toEqual([...TAG_COLOR_TOKENS]);
    });
  });

  describe('Event type enums (PG-203)', () => {
    const prisma = readFileSync(resolve(__dirname, '../../db/prisma/schema.prisma'), 'utf8');
    const prismaEnum = (name: string): string[] => {
      const body = new RegExp(String.raw`enum ${name} \{([^}]*)\}`).exec(prisma)?.[1] ?? '';
      return body
        .split(/\r?\n/)
        .map((line) => {
          const comment = line.indexOf('//');
          return (comment === -1 ? line : line.slice(0, comment)).trim();
        })
        .filter(Boolean);
    };

    it('should keep LeadSource identical in domain, validators and Prisma (BOOKING included)', () => {
      expect(LEAD_SOURCES).toContain('BOOKING');
      expect(prismaEnum('LeadSource')).toEqual([...LEAD_SOURCES]);
    });

    it('should keep EventLocationType identical in domain, validators and Prisma', () => {
      expect(eventLocationTypeSchema.options).toEqual([...EVENT_LOCATION_TYPES]);
      expect(prismaEnum('EventLocationType')).toEqual([...EVENT_LOCATION_TYPES]);
    });

    it('should derive the event-type lead source and required-field schemas from the domain', () => {
      expect(eventTypeLeadSourceSchema.options).toEqual([...EVENT_TYPE_LEAD_SOURCES]);
      expect(eventTypeRequiredFieldSchema.options).toEqual([...EVENT_TYPE_REQUIRED_FIELDS]);
    });

    it('should use the tag colour tokens for event types', () => {
      expect([...EVENT_TYPE_COLOR_TOKENS]).toEqual([...TAG_COLOR_TOKENS]);
    });

    it('should keep the DSAR enums identical in domain, validators and Prisma (PG-203 DSAR)', () => {
      expect(dsarRequestTypeSchema.options).toEqual([...DSAR_REQUEST_TYPES]);
      expect(prismaEnum('DsarRequestType')).toEqual([...DSAR_REQUEST_TYPES]);
      expect(dsarStatusSchema.options).toEqual([...DSAR_STATUSES]);
      expect(prismaEnum('DsarRequestStatus')).toEqual([...DSAR_STATUSES]);
    });
  });

  describe('Appointment enums (constants exported but no validators yet)', () => {
    it('should export APPOINTMENT_STATUSES from domain', () => {
      expect(APPOINTMENT_STATUSES).toHaveLength(6);
      expect(APPOINTMENT_STATUSES).toContain('SCHEDULED');
      expect(APPOINTMENT_STATUSES).toContain('COMPLETED');
    });

    it('should export APPOINTMENT_TYPES from domain', () => {
      expect(APPOINTMENT_TYPES).toHaveLength(6);
      expect(APPOINTMENT_TYPES).toContain('MEETING');
      expect(APPOINTMENT_TYPES).toContain('HEARING');
    });
  });
});
