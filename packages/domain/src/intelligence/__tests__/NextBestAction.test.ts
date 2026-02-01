/**
 * NextBestAction Value Object Tests (IFC-095)
 */

import { describe, it, expect } from 'vitest';
import { NextBestAction, InvalidActionTypeError, InvalidPriorityError } from '../NextBestAction';
import { NBA_ACTION_TYPES, NBA_ACTION_PRIORITIES } from '../../ai/AIConstants';

describe('NextBestAction', () => {
  describe('create', () => {
    it('should create with valid action type and priority', () => {
      const nba = NextBestAction.create({
        actionType: 'CALL',
        priority: 'HIGH',
        rationale: 'Customer needs immediate attention',
        deadline: new Date('2026-02-01'),
      });
      expect(nba.getActionType()).toBe('CALL');
      expect(nba.getPriority()).toBe('HIGH');
      expect(nba.getRationale()).toBe('Customer needs immediate attention');
    });

    it('should throw InvalidActionTypeError for unknown action type', () => {
      expect(() => NextBestAction.create({
        actionType: 'INVALID_ACTION',
        priority: 'HIGH',
        rationale: 'Test',
        deadline: null,
      })).toThrow(InvalidActionTypeError);
    });

    it('should throw InvalidPriorityError for unknown priority', () => {
      expect(() => NextBestAction.create({
        actionType: 'CALL',
        priority: 'INVALID_PRIORITY',
        rationale: 'Test',
        deadline: null,
      })).toThrow(InvalidPriorityError);
    });

    it('should accept all NBA_ACTION_TYPES', () => {
      NBA_ACTION_TYPES.forEach(actionType => {
        const nba = NextBestAction.create({
          actionType,
          priority: 'MEDIUM',
          rationale: 'Test',
          deadline: null,
        });
        expect(nba.getActionType()).toBe(actionType);
      });
    });

    it('should accept all NBA_ACTION_PRIORITIES', () => {
      NBA_ACTION_PRIORITIES.forEach(priority => {
        const nba = NextBestAction.create({
          actionType: 'CALL',
          priority,
          rationale: 'Test',
          deadline: null,
        });
        expect(nba.getPriority()).toBe(priority);
      });
    });

    it('should accept deadline as Date', () => {
      const deadline = new Date('2026-02-15');
      const nba = NextBestAction.create({
        actionType: 'SEND_PROPOSAL',
        priority: 'LOW',
        rationale: 'Test',
        deadline,
      });
      expect(nba.getDeadline()).toEqual(deadline);
    });

    it('should accept deadline as null', () => {
      const nba = NextBestAction.create({
        actionType: 'WAIT',
        priority: 'LOW',
        rationale: 'Test',
        deadline: null,
      });
      expect(nba.getDeadline()).toBeNull();
    });

    it('should accept optional confidence', () => {
      const nba = NextBestAction.create({
        actionType: 'CALL',
        priority: 'HIGH',
        rationale: 'Test',
        deadline: null,
        confidence: 0.85,
      });
      expect(nba.getConfidence()).toBe(0.85);
    });
  });

  describe('isUrgent', () => {
    it('should return true for CRITICAL priority', () => {
      const nba = NextBestAction.create({
        actionType: 'CALL',
        priority: 'CRITICAL',
        rationale: 'Test',
        deadline: null,
      });
      expect(nba.isUrgent()).toBe(true);
    });

    it('should return true for HIGH priority', () => {
      const nba = NextBestAction.create({
        actionType: 'CALL',
        priority: 'HIGH',
        rationale: 'Test',
        deadline: null,
      });
      expect(nba.isUrgent()).toBe(true);
    });

    it('should return false for MEDIUM priority', () => {
      const nba = NextBestAction.create({
        actionType: 'CALL',
        priority: 'MEDIUM',
        rationale: 'Test',
        deadline: null,
      });
      expect(nba.isUrgent()).toBe(false);
    });

    it('should return false for LOW priority', () => {
      const nba = NextBestAction.create({
        actionType: 'CALL',
        priority: 'LOW',
        rationale: 'Test',
        deadline: null,
      });
      expect(nba.isUrgent()).toBe(false);
    });
  });

  describe('hasDeadline', () => {
    it('should return true when deadline is set', () => {
      const nba = NextBestAction.create({
        actionType: 'SEND_PROPOSAL',
        priority: 'MEDIUM',
        rationale: 'Test',
        deadline: new Date('2026-02-15'),
      });
      expect(nba.hasDeadline()).toBe(true);
    });

    it('should return false when deadline is null', () => {
      const nba = NextBestAction.create({
        actionType: 'WAIT',
        priority: 'LOW',
        rationale: 'Test',
        deadline: null,
      });
      expect(nba.hasDeadline()).toBe(false);
    });
  });

  describe('isOverdue', () => {
    it('should return false when no deadline', () => {
      const nba = NextBestAction.create({
        actionType: 'WAIT',
        priority: 'LOW',
        rationale: 'Test',
        deadline: null,
      });
      expect(nba.isOverdue()).toBe(false);
    });

    it('should return false when deadline is in the future', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const nba = NextBestAction.create({
        actionType: 'CALL',
        priority: 'HIGH',
        rationale: 'Test',
        deadline: futureDate,
      });
      expect(nba.isOverdue()).toBe(false);
    });

    it('should return true when deadline is in the past', () => {
      const pastDate = new Date('2020-01-01');

      const nba = NextBestAction.create({
        actionType: 'CALL',
        priority: 'HIGH',
        rationale: 'Test',
        deadline: pastDate,
      });
      expect(nba.isOverdue()).toBe(true);
    });
  });

  describe('toValue', () => {
    it('should return serializable object with deadline', () => {
      const deadline = new Date('2026-02-15T10:00:00Z');
      const nba = NextBestAction.create({
        actionType: 'SEND_PROPOSAL',
        priority: 'HIGH',
        rationale: 'Customer is ready to buy',
        deadline,
        confidence: 0.9,
      });
      const value = nba.toValue();

      expect(value).toEqual({
        actionType: 'SEND_PROPOSAL',
        priority: 'HIGH',
        rationale: 'Customer is ready to buy',
        deadline: '2026-02-15T10:00:00.000Z',
        confidence: 0.9,
      });
    });

    it('should return serializable object with null deadline', () => {
      const nba = NextBestAction.create({
        actionType: 'WAIT',
        priority: 'LOW',
        rationale: 'No action needed',
        deadline: null,
      });
      const value = nba.toValue();

      expect(value.deadline).toBeNull();
      expect(value.confidence).toBeUndefined();
    });
  });

  describe('equality', () => {
    it('should be equal for same values', () => {
      const deadline = new Date('2026-02-15');
      const nba1 = NextBestAction.create({
        actionType: 'CALL',
        priority: 'HIGH',
        rationale: 'Test',
        deadline,
      });
      const nba2 = NextBestAction.create({
        actionType: 'CALL',
        priority: 'HIGH',
        rationale: 'Test',
        deadline,
      });
      expect(nba1.equals(nba2)).toBe(true);
    });

    it('should not be equal for different action types', () => {
      const nba1 = NextBestAction.create({
        actionType: 'CALL',
        priority: 'HIGH',
        rationale: 'Test',
        deadline: null,
      });
      const nba2 = NextBestAction.create({
        actionType: 'EMAIL',
        priority: 'HIGH',
        rationale: 'Test',
        deadline: null,
      });
      expect(nba1.equals(nba2)).toBe(false);
    });
  });
});
