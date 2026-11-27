import { describe, it, expect } from 'vitest';
import type { TaskListItem } from '@/components/tasks/TaskList';
import type { TaskFormData } from '@/components/tasks/TaskForm';
import { getEditingTaskDueDate, getEntityName, resolveEntityIds } from '../task-page-helpers';

const task = (over: Record<string, unknown>) =>
  ({
    lead: null,
    contact: null,
    opportunity: null,
    dueDate: null,
    ...over,
  }) as unknown as TaskListItem;

describe('getEntityName', () => {
  it('names the lead, contact or opportunity a task is about', () => {
    expect(getEntityName(task({ lead: { firstName: 'Jane', lastName: 'Doe' } }))).toBe('Jane Doe');
    expect(getEntityName(task({ contact: { firstName: 'Sam', lastName: null } }))).toBe('Sam');
    expect(getEntityName(task({ opportunity: { name: 'Big deal' } }))).toBe('Big deal');
    expect(getEntityName(task({}))).toBe('');
  });
});

describe('resolveEntityIds', () => {
  const form = (entityType: string, entityId: string) =>
    ({ entityType, entityId }) as unknown as TaskFormData;

  it('puts the id on the matching field only', () => {
    expect(resolveEntityIds(form('lead', 'a'))).toEqual({
      leadId: 'a',
      contactId: undefined,
      opportunityId: undefined,
    });
    expect(resolveEntityIds(form('contact', 'b')).contactId).toBe('b');
    expect(resolveEntityIds(form('opportunity', 'c')).opportunityId).toBe('c');
  });

  it('leaves every id empty when none is chosen', () => {
    expect(resolveEntityIds(form('lead', ''))).toEqual({
      leadId: undefined,
      contactId: undefined,
      opportunityId: undefined,
    });
  });
});

describe('getEditingTaskDueDate', () => {
  it('returns the date part of a string or Date due date, or empty', () => {
    expect(getEditingTaskDueDate(null)).toBe('');
    expect(getEditingTaskDueDate(task({}))).toBe('');
    expect(getEditingTaskDueDate(task({ dueDate: '2026-11-20T09:00:00.000Z' }))).toBe('2026-11-20');
    expect(getEditingTaskDueDate(task({ dueDate: new Date('2026-11-21T09:00:00.000Z') }))).toBe(
      '2026-11-21'
    );
  });
});
