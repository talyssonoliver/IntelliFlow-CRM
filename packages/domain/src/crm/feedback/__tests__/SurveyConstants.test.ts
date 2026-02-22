import { describe, it, expect } from 'vitest';
import {
  calculateNPS,
  calculateCSAT,
  calculateCES,
  SURVEY_TYPES,
  SURVEY_STATUSES,
  SURVEY_SCORE_RANGES,
  canTransitionSurveyTo,
  type SurveyType,
} from '../SurveyConstants';
import {
  SurveySentEvent,
  SurveyRespondedEvent,
  SurveyFollowedUpEvent,
  SurveyClosedEvent,
} from '../SurveyEvents';

describe('SurveyConstants', () => {
  describe('SURVEY_TYPES', () => {
    it('has 4 values: NPS, CSAT, CES, CUSTOM', () => {
      expect(SURVEY_TYPES).toEqual(['NPS', 'CSAT', 'CES', 'CUSTOM']);
      expect(SURVEY_TYPES).toHaveLength(4);
    });
  });

  describe('SURVEY_STATUSES', () => {
    it('has 5 values matching FeedbackStatus enum', () => {
      expect(SURVEY_STATUSES).toEqual(['PENDING', 'SENT', 'RESPONDED', 'FOLLOWED_UP', 'CLOSED']);
      expect(SURVEY_STATUSES).toHaveLength(5);
    });
  });

  describe('SURVEY_SCORE_RANGES', () => {
    it('keys match SURVEY_TYPES exactly', () => {
      const rangeKeys = Object.keys(SURVEY_SCORE_RANGES).sort();
      const typeValues = [...SURVEY_TYPES].sort();
      expect(rangeKeys).toEqual(typeValues);
    });

    it('NPS range is 0-10', () => {
      expect(SURVEY_SCORE_RANGES.NPS).toEqual({ min: 0, max: 10 });
    });

    it('CSAT range is 1-5', () => {
      expect(SURVEY_SCORE_RANGES.CSAT).toEqual({ min: 1, max: 5 });
    });

    it('CES range is 1-7', () => {
      expect(SURVEY_SCORE_RANGES.CES).toEqual({ min: 1, max: 7 });
    });

    it('CUSTOM range defaults to 0-10', () => {
      expect(SURVEY_SCORE_RANGES.CUSTOM).toEqual({ min: 0, max: 10 });
    });
  });

  describe('canTransitionSurveyTo', () => {
    it('allows PENDING → SENT', () => {
      expect(canTransitionSurveyTo('PENDING', 'SENT')).toBe(true);
    });

    it('blocks PENDING → CLOSED', () => {
      expect(canTransitionSurveyTo('PENDING', 'CLOSED')).toBe(false);
    });

    it('allows SENT → RESPONDED', () => {
      expect(canTransitionSurveyTo('SENT', 'RESPONDED')).toBe(true);
    });

    it('allows SENT → CLOSED', () => {
      expect(canTransitionSurveyTo('SENT', 'CLOSED')).toBe(true);
    });

    it('allows RESPONDED → FOLLOWED_UP', () => {
      expect(canTransitionSurveyTo('RESPONDED', 'FOLLOWED_UP')).toBe(true);
    });

    it('allows RESPONDED → CLOSED', () => {
      expect(canTransitionSurveyTo('RESPONDED', 'CLOSED')).toBe(true);
    });

    it('blocks CLOSED → any', () => {
      expect(canTransitionSurveyTo('CLOSED', 'PENDING')).toBe(false);
      expect(canTransitionSurveyTo('CLOSED', 'SENT')).toBe(false);
      expect(canTransitionSurveyTo('CLOSED', 'RESPONDED')).toBe(false);
      expect(canTransitionSurveyTo('CLOSED', 'FOLLOWED_UP')).toBe(false);
      expect(canTransitionSurveyTo('CLOSED', 'CLOSED')).toBe(false);
    });
  });

  describe('calculateNPS', () => {
    it('returns 0 for empty array (not NaN)', () => {
      expect(calculateNPS([])).toBe(0);
      expect(Number.isNaN(calculateNPS([]))).toBe(false);
    });

    it('returns 100 for all promoters (scores 9-10)', () => {
      expect(calculateNPS([9, 10, 9, 10])).toBe(100);
    });

    it('returns -100 for all detractors (scores 0-6)', () => {
      expect(calculateNPS([0, 1, 2, 3, 4, 5, 6])).toBe(-100);
    });

    it('returns correct mixed score', () => {
      // 2 promoters (9,10), 2 passives (7,8), 2 detractors (3,5)
      // NPS = ((2 - 2) / 6) * 100 = 0
      expect(calculateNPS([9, 10, 7, 8, 3, 5])).toBe(0);
    });

    it('returns 0 for all passives (scores 7-8)', () => {
      expect(calculateNPS([7, 8, 7, 8])).toBe(0);
    });

    it('rounds to nearest integer', () => {
      // 1 promoter, 2 detractors out of 3 = ((1-2)/3)*100 = -33.33 → -33
      expect(calculateNPS([9, 3, 5])).toBe(-33);
    });
  });

  describe('calculateCSAT', () => {
    it('returns 0 for empty array', () => {
      expect(calculateCSAT([])).toBe(0);
    });

    it('returns correct percentage (score >= 4 is satisfied)', () => {
      // 3 satisfied (4,5,5) out of 5 = 60%
      expect(calculateCSAT([4, 5, 5, 2, 1])).toBe(60);
    });

    it('returns 100 when all satisfied', () => {
      expect(calculateCSAT([4, 5, 4, 5])).toBe(100);
    });

    it('returns 0 when none satisfied', () => {
      expect(calculateCSAT([1, 2, 3])).toBe(0);
    });
  });

  describe('calculateCES', () => {
    it('returns 0 for empty array', () => {
      expect(calculateCES([])).toBe(0);
    });

    it('returns correct average', () => {
      // (3 + 5 + 7) / 3 = 5
      expect(calculateCES([3, 5, 7])).toBe(5);
    });

    it('returns decimal rounded to 2 places', () => {
      // (1 + 2 + 3) / 3 = 2.0
      expect(calculateCES([1, 2, 3])).toBe(2);
    });
  });
});

describe('SurveyEvents', () => {
  it('SurveySentEvent has correct type and tenantId', () => {
    const event = new SurveySentEvent('s1', 'c1', 'NPS', 'tenant1');
    expect(event.eventType).toBe('crm.survey.sent');
    expect(event.tenantId).toBe('tenant1');
    expect(event.toPayload()).toMatchObject({
      surveyId: 's1',
      contactId: 'c1',
      surveyType: 'NPS',
      tenantId: 'tenant1',
    });
  });

  it('SurveyRespondedEvent has correct type and tenantId', () => {
    const event = new SurveyRespondedEvent('s1', 'c1', 'NPS', 9, 'tenant1');
    expect(event.eventType).toBe('crm.survey.responded');
    expect(event.tenantId).toBe('tenant1');
    expect(event.score).toBe(9);
  });

  it('SurveyRespondedEvent.toPayload includes all fields', () => {
    const event = new SurveyRespondedEvent('s1', 'c1', 'NPS', 9, 'tenant1');
    const payload = event.toPayload();
    expect(payload).toEqual({
      surveyId: 's1',
      contactId: 'c1',
      surveyType: 'NPS',
      score: 9,
      tenantId: 'tenant1',
    });
  });

  it('SurveyFollowedUpEvent has correct type and tenantId', () => {
    const event = new SurveyFollowedUpEvent('s1', 'user1', 'tenant1');
    expect(event.eventType).toBe('crm.survey.followed_up');
    expect(event.tenantId).toBe('tenant1');
  });

  it('SurveyFollowedUpEvent.toPayload includes all fields', () => {
    const event = new SurveyFollowedUpEvent('s1', 'user1', 'tenant1');
    const payload = event.toPayload();
    expect(payload).toEqual({
      surveyId: 's1',
      followUpBy: 'user1',
      tenantId: 'tenant1',
    });
  });

  it('SurveyClosedEvent has correct type and tenantId', () => {
    const event = new SurveyClosedEvent('s1', 'tenant1');
    expect(event.eventType).toBe('crm.survey.closed');
    expect(event.tenantId).toBe('tenant1');
  });

  it('SurveyClosedEvent.toPayload includes all fields', () => {
    const event = new SurveyClosedEvent('s1', 'tenant1');
    const payload = event.toPayload();
    expect(payload).toEqual({
      surveyId: 's1',
      tenantId: 'tenant1',
    });
  });
});
