import { describe, it, expect } from 'vitest';
import {
  getSourceIcon,
  getSourceColor,
  getSourceLabel,
  getSourceHref,
  getRelevanceBadgeClass,
  formatRelevanceScore,
} from '../search-utils';

describe('search-utils', () => {
  describe('getSourceIcon', () => {
    it.each([
      ['leads', 'leaderboard'],
      ['contacts', 'contacts'],
      ['accounts', 'business'],
      ['opportunities', 'trending_up'],
      ['documents', 'description'],
      ['notes', 'sticky_note_2'],
      ['conversations', 'chat'],
      ['messages', 'message'],
      ['tickets', 'confirmation_number'],
    ])('returns correct icon for %s', (source, expectedIcon) => {
      expect(getSourceIcon(source)).toBe(expectedIcon);
    });

    it('returns fallback icon for unknown source', () => {
      expect(getSourceIcon('unknown')).toBe('search');
    });
  });

  describe('getSourceColor', () => {
    it.each([
      ['leads', 'bg-orange-100'],
      ['contacts', 'bg-blue-100'],
      ['accounts', 'bg-purple-100'],
      ['opportunities', 'bg-green-100'],
      ['documents', 'bg-indigo-100'],
      ['notes', 'bg-yellow-100'],
      ['conversations', 'bg-teal-100'],
      ['messages', 'bg-cyan-100'],
      ['tickets', 'bg-red-100'],
    ])('returns correct color class for %s', (source, expectedColorPrefix) => {
      expect(getSourceColor(source)).toContain(expectedColorPrefix);
    });

    it('returns fallback class for unknown source', () => {
      expect(getSourceColor('unknown')).toContain('bg-gray-100');
    });
  });

  describe('getSourceLabel', () => {
    it.each([
      ['leads', 'Leads'],
      ['contacts', 'Contacts'],
      ['accounts', 'Accounts'],
      ['opportunities', 'Opportunities'],
      ['documents', 'Documents'],
      ['notes', 'Notes'],
      ['conversations', 'Conversations'],
      ['messages', 'Messages'],
      ['tickets', 'Tickets'],
    ])('returns human-readable label for %s', (source, expectedLabel) => {
      expect(getSourceLabel(source)).toBe(expectedLabel);
    });

    it('returns capitalized source for unknown source', () => {
      expect(getSourceLabel('custom')).toBe('Custom');
    });
  });

  describe('getSourceHref', () => {
    it.each([
      ['leads', 'lead-123', '/leads/lead-123'],
      ['contacts', 'ct-456', '/contacts/ct-456'],
      ['accounts', 'acc-789', '/accounts/acc-789'],
      ['opportunities', 'opp-1', '/opportunities/opp-1'],
      ['documents', 'doc-2', '/documents/doc-2'],
      ['tickets', 'tkt-3', '/tickets/tkt-3'],
      ['conversations', 'conv-4', '/agent-approvals/logs?id=conv-4'],
    ])('constructs correct route for %s', (source, id, expectedHref) => {
      expect(getSourceHref(source, id)).toBe(expectedHref);
    });

    it('returns # for inline sources (notes)', () => {
      expect(getSourceHref('notes', 'note-1')).toBe('#');
    });

    it('returns # for inline sources (messages)', () => {
      expect(getSourceHref('messages', 'msg-1')).toBe('#');
    });
  });

  describe('getRelevanceBadgeClass', () => {
    it('returns green class for score > 0.8', () => {
      expect(getRelevanceBadgeClass(0.85)).toContain('bg-green');
    });

    it('returns yellow class for score between 0.6 and 0.8', () => {
      expect(getRelevanceBadgeClass(0.7)).toContain('bg-yellow');
    });

    it('returns yellow class for score exactly 0.6', () => {
      expect(getRelevanceBadgeClass(0.6)).toContain('bg-yellow');
    });

    it('returns orange class for score < 0.6', () => {
      expect(getRelevanceBadgeClass(0.4)).toContain('bg-orange');
    });

    it('returns green class for score exactly 0.81', () => {
      expect(getRelevanceBadgeClass(0.81)).toContain('bg-green');
    });
  });

  describe('formatRelevanceScore', () => {
    it('formats 0.85 as "85%"', () => {
      expect(formatRelevanceScore(0.85)).toBe('85%');
    });

    it('formats 0 as "0%"', () => {
      expect(formatRelevanceScore(0)).toBe('0%');
    });

    it('formats 1 as "100%"', () => {
      expect(formatRelevanceScore(1)).toBe('100%');
    });

    it('formats 0.333 as "33%"', () => {
      expect(formatRelevanceScore(0.333)).toBe('33%');
    });
  });
});
