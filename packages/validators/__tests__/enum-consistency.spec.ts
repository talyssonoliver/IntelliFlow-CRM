/**
 * Architecture Test: Enum Consistency
 *
 * Ensures that validator Zod schemas are derived from domain constants,
 * enforcing the single source of truth pattern for enum values.
 */

import { describe, it, expect } from 'vitest';

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
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  SLA_STATUSES,
} from '@intelliflow/domain';

// Import validator schemas
import {
  leadStatusSchema,
  leadSourceSchema,
} from '../src/lead';

import {
  opportunityStageSchema,
} from '../src/opportunity';

import {
  taskStatusSchema,
  taskPrioritySchema,
} from '../src/task';

import {
  caseStatusSchema,
  casePrioritySchema,
  caseTaskStatusSchema,
} from '../src/case';

import {
  ticketStatusSchema,
  ticketPrioritySchema,
  slaStatusSchema,
} from '../src/ticket';

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
