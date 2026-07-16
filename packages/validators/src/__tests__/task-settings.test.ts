import { describe, it, expect } from 'vitest';
import {
  dueDateOffsetDaysSchema,
  reminderDefaultsSchema,
  taskTemplateSchema,
  taskTemplatesSchema,
  updateTaskSettingsSchema,
  taskSettingsSchema,
  DEFAULT_TASK_SETTINGS,
  MAX_TASK_TEMPLATES,
} from '../task-settings';

describe('task-settings validators (PG-191)', () => {
  describe('dueDateOffsetDaysSchema', () => {
    it('accepts valid in-range integers', () => {
      expect(dueDateOffsetDaysSchema.parse(0)).toBe(0);
      expect(dueDateOffsetDaysSchema.parse(3)).toBe(3);
      expect(dueDateOffsetDaysSchema.parse(365)).toBe(365);
    });
    it('rejects negative, non-integer, and out-of-range values', () => {
      expect(dueDateOffsetDaysSchema.safeParse(-1).success).toBe(false);
      expect(dueDateOffsetDaysSchema.safeParse(1.5).success).toBe(false);
      expect(dueDateOffsetDaysSchema.safeParse(366).success).toBe(false);
    });
  });

  describe('reminderDefaultsSchema', () => {
    it('accepts an enabled reminder with a positive lead time', () => {
      expect(reminderDefaultsSchema.parse({ enabled: true, minutesBefore: 60 })).toEqual({
        enabled: true,
        minutesBefore: 60,
      });
    });
    it('accepts a disabled reminder with zero lead time', () => {
      expect(reminderDefaultsSchema.safeParse({ enabled: false, minutesBefore: 0 }).success).toBe(
        true
      );
    });
    it('rejects an enabled reminder with zero lead time (superRefine)', () => {
      const result = reminderDefaultsSchema.safeParse({ enabled: true, minutesBefore: 0 });
      expect(result.success).toBe(false);
    });
    it('rejects out-of-range lead times', () => {
      expect(reminderDefaultsSchema.safeParse({ enabled: true, minutesBefore: -1 }).success).toBe(
        false
      );
      expect(
        reminderDefaultsSchema.safeParse({ enabled: true, minutesBefore: 40321 }).success
      ).toBe(false);
    });
  });

  describe('taskTemplateSchema', () => {
    const valid = {
      id: 't1',
      name: 'Follow up',
      defaultPriority: 'MEDIUM' as const,
      defaultDueOffsetDays: 2,
    };
    it('accepts a valid template', () => {
      expect(taskTemplateSchema.parse(valid)).toEqual(valid);
    });
    it('rejects empty name and over-long name', () => {
      expect(taskTemplateSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
      expect(taskTemplateSchema.safeParse({ ...valid, name: 'x'.repeat(81) }).success).toBe(false);
    });
    it('rejects an invalid priority', () => {
      expect(taskTemplateSchema.safeParse({ ...valid, defaultPriority: 'NOPE' }).success).toBe(
        false
      );
    });
  });

  describe('taskTemplatesSchema', () => {
    const mk = (id: string, name: string) => ({
      id,
      name,
      defaultPriority: 'LOW' as const,
      defaultDueOffsetDays: 1,
    });
    it('accepts distinct names', () => {
      expect(taskTemplatesSchema.safeParse([mk('a', 'Alpha'), mk('b', 'Beta')]).success).toBe(true);
    });
    it('rejects duplicate names (case/whitespace-insensitive superRefine)', () => {
      const result = taskTemplatesSchema.safeParse([mk('a', 'Alpha'), mk('b', ' alpha ')]);
      expect(result.success).toBe(false);
    });
    it(`rejects more than ${MAX_TASK_TEMPLATES} templates`, () => {
      const many = Array.from({ length: MAX_TASK_TEMPLATES + 1 }, (_, i) => mk(`id${i}`, `T${i}`));
      expect(taskTemplatesSchema.safeParse(many).success).toBe(false);
    });
    it('accepts an empty list', () => {
      expect(taskTemplatesSchema.parse([])).toEqual([]);
    });
  });

  describe('updateTaskSettingsSchema', () => {
    it('accepts an empty no-op object', () => {
      expect(updateTaskSettingsSchema.parse({})).toEqual({});
    });
    it('accepts each field independently', () => {
      expect(updateTaskSettingsSchema.safeParse({ dueDateOffsetDays: 7 }).success).toBe(true);
      expect(
        updateTaskSettingsSchema.safeParse({
          reminderDefaults: { enabled: false, minutesBefore: 0 },
        }).success
      ).toBe(true);
      expect(updateTaskSettingsSchema.safeParse({ taskTemplates: [] }).success).toBe(true);
    });
  });

  describe('DEFAULT_TASK_SETTINGS', () => {
    it('is a valid full settings object', () => {
      expect(taskSettingsSchema.safeParse(DEFAULT_TASK_SETTINGS).success).toBe(true);
    });
    it('has the expected shape', () => {
      expect(DEFAULT_TASK_SETTINGS).toEqual({
        dueDateOffsetDays: 3,
        reminderDefaults: { enabled: true, minutesBefore: 60 },
        taskTemplates: [],
      });
    });
  });
});
