/**
 * PinnedItemsSheet - Supplementary2 Tests
 *
 * Tests pure utility functions and data structures exported from PinnedItemsSheet.tsx:
 * - loadEnabledActions / loadPinnedGroups persistence logic
 * - saveEnabledActions / savePinnedGroups persistence logic
 * - getPinnedIcon mapping with all entity types
 * - ALL_QUICK_ACTIONS data integrity
 * - ALL_PINNED_NAV_GROUPS data integrity
 * - PINNED_ICON_MAP completeness
 * - DEFAULT_ICON fallback
 * - Edge cases: corrupted localStorage, empty sets, unknown types
 *
 * NO @testing-library/react - logic only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// localStorage mock
// ============================================================
const store = vi.hoisted(() => {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: vi.fn((key: string) => data[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { data[key] = val; }),
    removeItem: vi.fn((key: string) => { delete data[key]; }),
    clear: vi.fn(() => { for (const k of Object.keys(data)) delete data[k]; }),
  };
});

// Must be defined before import
Object.defineProperty(globalThis, 'localStorage', { value: store, writable: true });

// ============================================================
// Mock Next.js Link and @intelliflow/ui to prevent import errors
// ============================================================
vi.mock('next/link', () => ({ default: vi.fn() }));
vi.mock('@intelliflow/ui', () => ({
  Sheet: vi.fn(),
  SheetContent: vi.fn(),
  SheetTitle: vi.fn(),
  SheetDescription: vi.fn(),
}));

// ============================================================
// Imports (after mocks)
// ============================================================
import {
  ALL_QUICK_ACTIONS,
  ALL_PINNED_NAV_GROUPS,
  loadEnabledActions,
  loadPinnedGroups,
  getPinnedIcon,
  PINNED_ICON_MAP,
  DEFAULT_ICON,
} from '../PinnedItemsSheet';

// ============================================================
// Tests
// ============================================================
describe('PinnedItemsSheet utility functions (supplementary2)', () => {
  beforeEach(() => {
    store.clear();
    store.getItem.mockClear();
    store.setItem.mockClear();
  });

  // -------------------------------------------------------
  // ALL_QUICK_ACTIONS data integrity
  // -------------------------------------------------------
  describe('ALL_QUICK_ACTIONS', () => {
    it('has exactly 8 actions', () => {
      expect(ALL_QUICK_ACTIONS).toHaveLength(8);
    });

    it('each action id is unique', () => {
      const ids = ALL_QUICK_ACTIONS.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('each action has non-empty iconBg and iconColor', () => {
      for (const a of ALL_QUICK_ACTIONS) {
        expect(a.iconBg.length).toBeGreaterThan(0);
        expect(a.iconColor.length).toBeGreaterThan(0);
      }
    });

    it('each action has href starting with /', () => {
      for (const a of ALL_QUICK_ACTIONS) {
        expect(a.href.startsWith('/')).toBe(true);
      }
    });

    it('contains action-lead, action-deal, action-document, action-report', () => {
      const ids = ALL_QUICK_ACTIONS.map((a) => a.id);
      expect(ids).toContain('action-lead');
      expect(ids).toContain('action-deal');
      expect(ids).toContain('action-document');
      expect(ids).toContain('action-report');
    });
  });

  // -------------------------------------------------------
  // ALL_PINNED_NAV_GROUPS data integrity
  // -------------------------------------------------------
  describe('ALL_PINNED_NAV_GROUPS', () => {
    it('has at least 7 navigation groups', () => {
      expect(ALL_PINNED_NAV_GROUPS.length).toBeGreaterThanOrEqual(7);
    });

    it('each group id is unique', () => {
      const ids = ALL_PINNED_NAV_GROUPS.map((g) => g.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('each group has a non-empty entityTypes array', () => {
      for (const g of ALL_PINNED_NAV_GROUPS) {
        expect(Array.isArray(g.entityTypes)).toBe(true);
        expect(g.entityTypes.length).toBeGreaterThan(0);
      }
    });

    it('contains nav-tickets, nav-analytics, nav-marketing, nav-knowledge', () => {
      const ids = ALL_PINNED_NAV_GROUPS.map((g) => g.id);
      expect(ids).toContain('nav-tickets');
      expect(ids).toContain('nav-analytics');
      expect(ids).toContain('nav-marketing');
      expect(ids).toContain('nav-knowledge');
    });

    it('nav-knowledge entityTypes includes document', () => {
      const knowledge = ALL_PINNED_NAV_GROUPS.find((g) => g.id === 'nav-knowledge');
      expect(knowledge?.entityTypes).toContain('document');
    });
  });

  // -------------------------------------------------------
  // loadEnabledActions
  // -------------------------------------------------------
  describe('loadEnabledActions', () => {
    it('returns default 4-item set when localStorage is empty', () => {
      const result = loadEnabledActions();
      expect(result.size).toBe(4);
      expect(result.has('action-call')).toBe(true);
      expect(result.has('action-email')).toBe(true);
      expect(result.has('action-meeting')).toBe(true);
      expect(result.has('action-task')).toBe(true);
    });

    it('loads custom set from localStorage', () => {
      store.data['intelliflow:quick-actions'] = JSON.stringify(['action-lead', 'action-deal']);
      const result = loadEnabledActions();
      expect(result.size).toBe(2);
      expect(result.has('action-lead')).toBe(true);
      expect(result.has('action-deal')).toBe(true);
    });

    it('returns defaults when localStorage throws on getItem', () => {
      store.getItem.mockImplementationOnce(() => { throw new Error('quota exceeded'); });
      const result = loadEnabledActions();
      expect(result.has('action-call')).toBe(true);
    });

    it('returns defaults when localStorage has invalid JSON', () => {
      store.data['intelliflow:quick-actions'] = '{broken';
      const result = loadEnabledActions();
      expect(result.size).toBe(4);
    });

    it('returns empty set when stored value is empty array', () => {
      store.data['intelliflow:quick-actions'] = JSON.stringify([]);
      const result = loadEnabledActions();
      expect(result.size).toBe(0);
    });
  });

  // -------------------------------------------------------
  // loadPinnedGroups
  // -------------------------------------------------------
  describe('loadPinnedGroups', () => {
    it('returns default 3-item set when localStorage is empty', () => {
      const result = loadPinnedGroups();
      expect(result.size).toBe(3);
      expect(result.has('nav-leads')).toBe(true);
      expect(result.has('nav-contacts')).toBe(true);
      expect(result.has('nav-deals')).toBe(true);
    });

    it('loads custom groups from localStorage', () => {
      store.data['intelliflow:pinned-groups'] = JSON.stringify(['nav-analytics']);
      const result = loadPinnedGroups();
      expect(result.size).toBe(1);
      expect(result.has('nav-analytics')).toBe(true);
    });

    it('returns defaults when localStorage has invalid JSON', () => {
      store.data['intelliflow:pinned-groups'] = 'bad-data';
      const result = loadPinnedGroups();
      expect(result.has('nav-leads')).toBe(true);
    });

    it('returns empty set when stored value is empty array', () => {
      store.data['intelliflow:pinned-groups'] = JSON.stringify([]);
      const result = loadPinnedGroups();
      expect(result.size).toBe(0);
    });
  });

  // -------------------------------------------------------
  // getPinnedIcon
  // -------------------------------------------------------
  describe('getPinnedIcon', () => {
    it('returns correct style for all known entity types', () => {
      const expected: Record<string, string> = {
        document: 'folder_special',
        contact: 'contacts',
        list: 'contacts',
        lead: 'person',
        opportunity: 'attach_money',
        report: 'assessment',
        ticket: 'confirmation_number',
      };
      for (const [type, icon] of Object.entries(expected)) {
        const result = getPinnedIcon(type);
        expect(result.icon).toBe(icon);
        expect(result.iconBg).toBeTruthy();
        expect(result.iconColor).toBeTruthy();
      }
    });

    it('returns DEFAULT_ICON for unknown entity types', () => {
      expect(getPinnedIcon('widget')).toEqual(DEFAULT_ICON);
      expect(getPinnedIcon('')).toEqual(DEFAULT_ICON);
      expect(getPinnedIcon('CONTACT')).toEqual(DEFAULT_ICON); // case-sensitive
    });
  });

  // -------------------------------------------------------
  // PINNED_ICON_MAP
  // -------------------------------------------------------
  describe('PINNED_ICON_MAP', () => {
    it('has 7 entity type entries', () => {
      expect(Object.keys(PINNED_ICON_MAP)).toHaveLength(7);
    });

    it('each entry has icon, iconBg, iconColor', () => {
      for (const [key, style] of Object.entries(PINNED_ICON_MAP)) {
        expect(typeof style.icon).toBe('string');
        expect(style.icon.length).toBeGreaterThan(0);
        expect(style.iconBg).toBeTruthy();
        expect(style.iconColor).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------
  // DEFAULT_ICON
  // -------------------------------------------------------
  describe('DEFAULT_ICON', () => {
    it('has push_pin icon', () => {
      expect(DEFAULT_ICON.icon).toBe('push_pin');
    });

    it('has slate-based colors', () => {
      expect(DEFAULT_ICON.iconBg).toContain('slate');
      expect(DEFAULT_ICON.iconColor).toContain('slate');
    });
  });

  // -------------------------------------------------------
  // saveEnabledActions logic (tested indirectly via round-trip)
  // -------------------------------------------------------
  describe('save/load round-trip for quick actions', () => {
    it('saved actions persist through load cycle', () => {
      // Simulate the saveEnabledActions logic
      const toSave = new Set(['action-call', 'action-report']);
      store.data['intelliflow:quick-actions'] = JSON.stringify([...toSave]);

      const loaded = loadEnabledActions();
      expect(loaded.has('action-call')).toBe(true);
      expect(loaded.has('action-report')).toBe(true);
      expect(loaded.has('action-email')).toBe(false);
    });
  });

  // -------------------------------------------------------
  // savePinnedGroups logic (tested indirectly via round-trip)
  // -------------------------------------------------------
  describe('save/load round-trip for pinned groups', () => {
    it('saved groups persist through load cycle', () => {
      const toSave = new Set(['nav-tickets', 'nav-knowledge']);
      store.data['intelliflow:pinned-groups'] = JSON.stringify([...toSave]);

      const loaded = loadPinnedGroups();
      expect(loaded.has('nav-tickets')).toBe(true);
      expect(loaded.has('nav-knowledge')).toBe(true);
      expect(loaded.has('nav-leads')).toBe(false);
    });
  });
});
