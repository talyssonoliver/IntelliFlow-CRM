import { describe, it, expect } from 'vitest';
import { csvField } from '../AnalyticsAggregationService';

describe('csvField (codex 27/11: the Lead Metrics export split rows on JSON commas)', () => {
  it('quotes a field with commas or quotes and doubles inner quotes', () => {
    expect(csvField('[{"source":"WEB","count":2}]')).toBe('"[{""source"":""WEB"",""count"":2}]"');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
  });

  it('leaves plain values alone and writes empty for missing ones', () => {
    expect(csvField('Leads')).toBe('Leads');
    expect(csvField(42)).toBe('42');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('keeps every field of a row in its own column', () => {
    const row = ['40', csvField('[{"source":"WEB"},{"source":"EMAIL"}]'), '5'].join(',');
    // Three columns: count the commas outside quotes.
    let inQuotes = false;
    let separators = 0;
    for (const ch of row) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) separators += 1;
    }
    const fields = { length: separators + 1 };
    expect(fields).toHaveLength(3);
  });
});
