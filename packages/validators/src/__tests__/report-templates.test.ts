/**
 * Report Template Validator Tests — PG-200
 */

import { describe, it, expect } from 'vitest';
import {
  chartTypeSchema,
  sharingScopeSchema,
  createReportTemplateSchema,
  updateReportTemplateSchema,
  deleteReportTemplateSchema,
  getReportTemplateSchema,
} from '../report-templates';

describe('chartTypeSchema', () => {
  it('accepts each valid chart type', () => {
    for (const v of ['table', 'bar', 'line', 'pie', 'area'] as const) {
      expect(chartTypeSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects unknown chart type', () => {
    expect(chartTypeSchema.safeParse('scatter').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(chartTypeSchema.safeParse('').success).toBe(false);
  });
});

describe('sharingScopeSchema', () => {
  it('accepts each valid sharing scope', () => {
    for (const v of ['private', 'team', 'tenant'] as const) {
      expect(sharingScopeSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects unknown scope', () => {
    expect(sharingScopeSchema.safeParse('public').success).toBe(false);
  });
});

describe('createReportTemplateSchema', () => {
  const validCreate = {
    name: 'My Template',
    selectedColumns: ['revenue', 'deal_count'],
  };

  it('accepts minimal valid input', () => {
    const result = createReportTemplateSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      // Defaults are applied at the router level, not in the Zod schema.
      // Optional fields are undefined when not provided.
      expect(result.data.chartType).toBeUndefined();
      expect(result.data.defaultPeriod).toBeUndefined();
      expect(result.data.sharingScope).toBeUndefined();
      expect(result.data.filterSet).toBeUndefined();
    }
  });

  it('accepts full valid input', () => {
    const full = {
      name: 'Full Template',
      description: 'A complete template',
      selectedColumns: ['col1', 'col2'],
      chartType: 'bar',
      defaultPeriod: '90d',
      sharingScope: 'team',
      filterSet: { status: 'active' },
    };
    expect(createReportTemplateSchema.safeParse(full).success).toBe(true);
  });

  it('rejects name shorter than 1 character', () => {
    expect(createReportTemplateSchema.safeParse({ ...validCreate, name: '' }).success).toBe(false);
  });

  it('rejects name longer than 100 characters', () => {
    expect(
      createReportTemplateSchema.safeParse({ ...validCreate, name: 'x'.repeat(101) }).success
    ).toBe(false);
  });

  it('rejects description longer than 500 characters', () => {
    expect(
      createReportTemplateSchema.safeParse({
        ...validCreate,
        description: 'x'.repeat(501),
      }).success
    ).toBe(false);
  });

  it('rejects empty selectedColumns array', () => {
    expect(
      createReportTemplateSchema.safeParse({ ...validCreate, selectedColumns: [] }).success
    ).toBe(false);
  });

  it('rejects missing selectedColumns', () => {
    expect(createReportTemplateSchema.safeParse({ name: 'Template' }).success).toBe(false);
  });

  it('rejects invalid chartType', () => {
    expect(
      createReportTemplateSchema.safeParse({ ...validCreate, chartType: 'radar' }).success
    ).toBe(false);
  });

  it('rejects invalid defaultPeriod', () => {
    expect(
      createReportTemplateSchema.safeParse({ ...validCreate, defaultPeriod: '1y' }).success
    ).toBe(false);
  });

  it('rejects invalid sharingScope', () => {
    expect(
      createReportTemplateSchema.safeParse({ ...validCreate, sharingScope: 'all' }).success
    ).toBe(false);
  });

  it('accepts optional description as undefined', () => {
    const result = createReportTemplateSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });
});

describe('updateReportTemplateSchema', () => {
  it('rejects missing id', () => {
    expect(updateReportTemplateSchema.safeParse({ name: 'Updated' }).success).toBe(false);
  });

  it('rejects non-cuid id', () => {
    expect(
      updateReportTemplateSchema.safeParse({ id: 'not-a-cuid', name: 'Updated' }).success
    ).toBe(false);
  });

  it('accepts valid cuid id with no other fields', () => {
    const result = updateReportTemplateSchema.safeParse({ id: 'cjld2cjxh0000qzrmn831i7rn' });
    expect(result.success).toBe(true);
  });

  it('accepts full valid update', () => {
    const result = updateReportTemplateSchema.safeParse({
      id: 'cjld2cjxh0000qzrmn831i7rn',
      name: 'Updated Template',
      description: 'New description',
      chartType: 'line',
      defaultPeriod: '7d',
      sharingScope: 'tenant',
      selectedColumns: ['col1'],
      filterSet: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid chartType in update', () => {
    expect(
      updateReportTemplateSchema.safeParse({
        id: 'cjld2cjxh0000qzrmn831i7rn',
        chartType: 'invalid',
      }).success
    ).toBe(false);
  });

  it('rejects name longer than 100 characters in update', () => {
    expect(
      updateReportTemplateSchema.safeParse({
        id: 'cjld2cjxh0000qzrmn831i7rn',
        name: 'x'.repeat(101),
      }).success
    ).toBe(false);
  });
});

describe('deleteReportTemplateSchema', () => {
  it('accepts valid cuid id', () => {
    expect(deleteReportTemplateSchema.safeParse({ id: 'cjld2cjxh0000qzrmn831i7rn' }).success).toBe(
      true
    );
  });

  it('rejects missing id', () => {
    expect(deleteReportTemplateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects non-cuid id', () => {
    expect(deleteReportTemplateSchema.safeParse({ id: 'plain-string' }).success).toBe(false);
  });
});

describe('getReportTemplateSchema', () => {
  it('accepts valid cuid id', () => {
    expect(getReportTemplateSchema.safeParse({ id: 'cjld2cjxh0000qzrmn831i7rn' }).success).toBe(
      true
    );
  });

  it('rejects missing id', () => {
    expect(getReportTemplateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects non-cuid id', () => {
    expect(getReportTemplateSchema.safeParse({ id: '' }).success).toBe(false);
  });
});
