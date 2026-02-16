/**
 * Tests for timeline-event-model.ts
 * Covers: constants, groupEventsByDate, getEventTypeIcon, getEventTypeColor
 */
import { describe, it, expect } from 'vitest';

import {
  TIMELINE_EVENT_TYPES,
  TIMELINE_PRIORITIES,
  COMMUNICATION_CHANNELS,
  AGENT_ACTION_STATUSES,
  DOCUMENT_STATUSES,
  groupEventsByDate,
  getEventTypeIcon,
  getEventTypeColor,
  type TimelineEvent,
  type TimelineFilters,
  type TimelineQueryOptions,
  type TimelineResponse,
  type TimelineStats,
} from '../../../../lib/documents/timeline-event-model';

describe('timeline-event-model', () => {
  describe('constants', () => {
    it('TIMELINE_EVENT_TYPES has 16 types', () => {
      expect(TIMELINE_EVENT_TYPES).toHaveLength(16);
      expect(TIMELINE_EVENT_TYPES).toContain('task');
      expect(TIMELINE_EVENT_TYPES).toContain('escalation');
    });
    it('TIMELINE_PRIORITIES', () =>
      expect(TIMELINE_PRIORITIES).toEqual(['low', 'medium', 'high', 'urgent']));
    it('COMMUNICATION_CHANNELS has 7', () => {
      expect(COMMUNICATION_CHANNELS).toHaveLength(7);
      expect(COMMUNICATION_CHANNELS).toContain('email');
      expect(COMMUNICATION_CHANNELS).toContain('internal');
    });
    it('AGENT_ACTION_STATUSES', () =>
      expect(AGENT_ACTION_STATUSES).toEqual([
        'pending_approval',
        'approved',
        'rejected',
        'rolled_back',
        'expired',
      ]));
    it('DOCUMENT_STATUSES', () =>
      expect(DOCUMENT_STATUSES).toEqual([
        'draft',
        'under_review',
        'approved',
        'signed',
        'archived',
        'superseded',
      ]));
  });

  describe('groupEventsByDate', () => {
    it('returns [] for []', () => expect(groupEventsByDate([])).toEqual([]));

    it('groups by date', () => {
      const events: TimelineEvent[] = [
        { id: '1', type: 'task', title: 'T1', timestamp: new Date('2026-01-15T10:00:00Z') },
        { id: '2', type: 'email', title: 'E1', timestamp: new Date('2026-01-15T14:00:00Z') },
        { id: '3', type: 'call', title: 'C1', timestamp: new Date('2026-01-14T09:00:00Z') },
      ];
      const g = groupEventsByDate(events);
      expect(g).toHaveLength(2);
      expect(g[0].events).toHaveLength(2);
      expect(g[1].events).toHaveLength(1);
    });

    it('labels today as Today', () => {
      const d = new Date();
      d.setHours(10, 0, 0, 0);
      const g = groupEventsByDate([{ id: '1', type: 'note', title: 'N', timestamp: d }]);
      expect(g[0].label).toBe('Today');
    });

    it('labels yesterday as Yesterday', () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      d.setHours(10, 0, 0, 0);
      const g = groupEventsByDate([{ id: '1', type: 'note', title: 'N', timestamp: d }]);
      expect(g[0].label).toBe('Yesterday');
    });

    it('uses date format for older dates', () => {
      const g = groupEventsByDate([
        { id: '1', type: 'note', title: 'N', timestamp: new Date('2025-06-15') },
      ]);
      expect(g[0].label).not.toBe('Today');
      expect(g[0].label).toContain('2025');
    });

    it('sorts descending', () => {
      const events: TimelineEvent[] = [
        { id: '1', type: 'task', title: 'Old', timestamp: new Date('2025-01-01') },
        { id: '2', type: 'task', title: 'New', timestamp: new Date('2026-01-01') },
      ];
      const g = groupEventsByDate(events);
      expect(g[0].date.getTime()).toBeGreaterThan(g[1].date.getTime());
    });
  });

  describe('getEventTypeIcon', () => {
    it('task -> task_alt', () => expect(getEventTypeIcon('task')).toBe('task_alt'));
    it('task_completed -> check_circle', () =>
      expect(getEventTypeIcon('task_completed')).toBe('check_circle'));
    it('task_overdue -> error', () => expect(getEventTypeIcon('task_overdue')).toBe('error'));
    it('document -> description', () => expect(getEventTypeIcon('document')).toBe('description'));
    it('email -> mail', () => expect(getEventTypeIcon('email')).toBe('mail'));
    it('call -> call', () => expect(getEventTypeIcon('call')).toBe('call'));
    it('agent_action -> smart_toy', () =>
      expect(getEventTypeIcon('agent_action')).toBe('smart_toy'));
    it('escalation -> priority_high', () =>
      expect(getEventTypeIcon('escalation')).toBe('priority_high'));
    it('unknown -> event', () => expect(getEventTypeIcon('unknown' as any)).toBe('event'));
  });

  describe('getEventTypeColor', () => {
    it('task -> text-blue-500', () => expect(getEventTypeColor('task')).toBe('text-blue-500'));
    it('task_completed -> text-green-500', () =>
      expect(getEventTypeColor('task_completed')).toBe('text-green-500'));
    it('task_overdue -> text-red-500', () =>
      expect(getEventTypeColor('task_overdue')).toBe('text-red-500'));
    it('email -> text-sky-500', () => expect(getEventTypeColor('email')).toBe('text-sky-500'));
    it('escalation -> text-red-600', () =>
      expect(getEventTypeColor('escalation')).toBe('text-red-600'));
    it('unknown -> text-slate-500', () =>
      expect(getEventTypeColor('unknown' as any)).toBe('text-slate-500'));
  });

  describe('type interfaces', () => {
    it('TimelineEvent', () => {
      const e: TimelineEvent = { id: '1', type: 'task', title: 'T', timestamp: new Date() };
      expect(e.id).toBe('1');
    });
    it('TimelineFilters', () => {
      const f: TimelineFilters = { types: ['task'], search: 'x' };
      expect(f.types).toHaveLength(1);
    });
    it('TimelineQueryOptions', () => {
      const o: TimelineQueryOptions = { caseId: 'c1', limit: 20, sortOrder: 'desc' };
      expect(o.caseId).toBe('c1');
    });
    it('TimelineResponse', () => {
      const r: TimelineResponse = { events: [], total: 0, hasMore: false };
      expect(r.total).toBe(0);
    });
    it('TimelineStats', () => {
      const s: TimelineStats = {
        totalEvents: 100,
        byType: { task: 30 } as any,
        pendingApprovals: 5,
        overdueTasks: 2,
      };
      expect(s.totalEvents).toBe(100);
    });
  });
});
