import { describe, it, expect } from 'vitest';
import {
  buildQualificationNote,
  mapSourceToEnum,
  toTimeline,
  toRevenueBand,
  labelFor,
  timelineOptions,
  NOTE_MAX_LENGTH,
  type QualificationNoteInput,
} from '../lead-form-utils';

const emptyNoteInput: QualificationNoteInput = {
  source: '',
  sourceOther: '',
  companySize: '',
  industry: '',
  qualificationNotes: '',
};

describe('lead-form-utils', () => {
  describe('buildQualificationNote', () => {
    it('returns "" when no schema-less fields are filled', () => {
      expect(buildQualificationNote(emptyNoteInput)).toBe('');
    });

    it('serializes source detail (Other), company size, industry and notes — but NOT BANT', () => {
      const note = buildQualificationNote({
        source: 'other',
        sourceOther: 'Podcast ad',
        companySize: '11-50',
        industry: 'technology',
        qualificationNotes: 'Hot lead',
      });
      expect(note).toContain('Source detail: Podcast ad');
      expect(note).toContain('Company size: 11-50 employees'); // humanized label
      expect(note).toContain('Industry: Technology');
      expect(note).toContain('Notes: Hot lead');
      // BANT lives in structured columns, never the note
      expect(note).not.toContain('Budget:');
      expect(note).not.toContain('Timeline:');
      expect(note).not.toContain('Annual revenue:');
    });

    it('omits source detail unless source === "other"', () => {
      const note = buildQualificationNote({
        ...emptyNoteInput,
        source: 'website',
        sourceOther: 'ignored',
        industry: 'finance',
      });
      expect(note).not.toContain('Source detail');
      expect(note).toContain('Industry: Finance & Banking');
    });

    it('caps the note at NOTE_MAX_LENGTH', () => {
      const note = buildQualificationNote({
        ...emptyNoteInput,
        qualificationNotes: 'x'.repeat(6000),
      });
      expect(note.length).toBeLessThanOrEqual(NOTE_MAX_LENGTH);
    });
  });

  describe('mapSourceToEnum', () => {
    it.each([
      ['website', 'WEBSITE'],
      ['referral', 'REFERRAL'],
      ['linkedin', 'SOCIAL'],
      ['conference', 'EVENT'],
      ['cold_outreach', 'COLD_CALL'],
      ['other', 'OTHER'],
    ])('maps %s -> %s', (input, expected) => {
      expect(mapSourceToEnum(input)).toBe(expected);
    });

    it('returns undefined for a blank/unknown source', () => {
      expect(mapSourceToEnum('')).toBeUndefined();
      expect(mapSourceToEnum('carrier-pigeon')).toBeUndefined();
    });
  });

  describe('toTimeline / toRevenueBand enum narrowing', () => {
    it('returns the literal enum value for a valid input (trimmed)', () => {
      expect(toTimeline(' immediate ')).toBe('immediate');
      expect(toRevenueBand('1M-10M')).toBe('1M-10M');
    });

    it('returns undefined for a non-enum value (never sends an invalid enum)', () => {
      expect(toTimeline('someday')).toBeUndefined();
      expect(toRevenueBand('5 trillion')).toBeUndefined();
      expect(toTimeline('')).toBeUndefined();
    });
  });

  describe('labelFor', () => {
    it('resolves a value to its label, falling back to the raw value', () => {
      expect(labelFor(timelineOptions, 'immediate')).toBe('Immediate (within 1 month)');
      expect(labelFor(timelineOptions, 'nonexistent')).toBe('nonexistent');
    });
  });
});
