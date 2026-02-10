import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_FEED_SOURCES,
  ACTIVITY_FEED_TYPES,
  ACTIVITY_FEED_ENTITY_TYPES,
  ACTIVITY_FEED_DEFAULT_LIMIT,
  ACTIVITY_FEED_MAX_LIMIT,
} from '../ActivityFeedConstants';
import type {
  ActivityFeedSource,
  ActivityFeedType,
  ActivityFeedEntityType,
} from '../ActivityFeedConstants';

describe('ActivityFeedConstants', () => {
  describe('ACTIVITY_FEED_SOURCES', () => {
    it('contains exactly 7 source types', () => {
      expect(ACTIVITY_FEED_SOURCES).toHaveLength(7);
    });

    it('includes all expected sources', () => {
      expect(ACTIVITY_FEED_SOURCES).toContain('LEAD_ACTIVITY');
      expect(ACTIVITY_FEED_SOURCES).toContain('CONTACT_ACTIVITY');
      expect(ACTIVITY_FEED_SOURCES).toContain('OPPORTUNITY_EVENT');
      expect(ACTIVITY_FEED_SOURCES).toContain('TICKET_ACTIVITY');
      expect(ACTIVITY_FEED_SOURCES).toContain('EMAIL');
      expect(ACTIVITY_FEED_SOURCES).toContain('CALL');
      expect(ACTIVITY_FEED_SOURCES).toContain('CHAT');
    });

    it('is readonly', () => {
      const arr: readonly string[] = ACTIVITY_FEED_SOURCES;
      expect(arr).toBeDefined();
    });

    it('derives ActivityFeedSource type correctly', () => {
      const source: ActivityFeedSource = 'LEAD_ACTIVITY';
      expect(ACTIVITY_FEED_SOURCES).toContain(source);
    });
  });

  describe('ACTIVITY_FEED_TYPES', () => {
    it('contains exactly 17 activity types', () => {
      expect(ACTIVITY_FEED_TYPES).toHaveLength(17);
    });

    it('includes all expected types', () => {
      const expected = [
        'EMAIL', 'CALL', 'MEETING', 'NOTE', 'TASK', 'CHAT', 'DOCUMENT',
        'DEAL', 'TICKET', 'STAGE_CHANGE', 'STATUS_CHANGE', 'SCORE_UPDATE',
        'QUALIFICATION', 'AGENT_ACTION', 'SLA_ALERT', 'ASSIGNMENT', 'SYSTEM',
      ];
      for (const t of expected) {
        expect(ACTIVITY_FEED_TYPES).toContain(t);
      }
    });

    it('has no duplicates', () => {
      const unique = new Set(ACTIVITY_FEED_TYPES);
      expect(unique.size).toBe(ACTIVITY_FEED_TYPES.length);
    });

    it('derives ActivityFeedType correctly', () => {
      const type: ActivityFeedType = 'EMAIL';
      expect(ACTIVITY_FEED_TYPES).toContain(type);
    });
  });

  describe('ACTIVITY_FEED_ENTITY_TYPES', () => {
    it('contains exactly 5 entity types', () => {
      expect(ACTIVITY_FEED_ENTITY_TYPES).toHaveLength(5);
    });

    it('includes all expected entity types', () => {
      expect(ACTIVITY_FEED_ENTITY_TYPES).toContain('LEAD');
      expect(ACTIVITY_FEED_ENTITY_TYPES).toContain('CONTACT');
      expect(ACTIVITY_FEED_ENTITY_TYPES).toContain('OPPORTUNITY');
      expect(ACTIVITY_FEED_ENTITY_TYPES).toContain('TICKET');
      expect(ACTIVITY_FEED_ENTITY_TYPES).toContain('ACCOUNT');
    });

    it('derives ActivityFeedEntityType correctly', () => {
      const entityType: ActivityFeedEntityType = 'LEAD';
      expect(ACTIVITY_FEED_ENTITY_TYPES).toContain(entityType);
    });
  });

  describe('pagination constants', () => {
    it('ACTIVITY_FEED_DEFAULT_LIMIT equals 20', () => {
      expect(ACTIVITY_FEED_DEFAULT_LIMIT).toBe(20);
    });

    it('ACTIVITY_FEED_MAX_LIMIT equals 100', () => {
      expect(ACTIVITY_FEED_MAX_LIMIT).toBe(100);
    });

    it('default limit is less than max limit', () => {
      expect(ACTIVITY_FEED_DEFAULT_LIMIT).toBeLessThan(ACTIVITY_FEED_MAX_LIMIT);
    });
  });
});
