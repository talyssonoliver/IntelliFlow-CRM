import { describe, it, expect } from 'vitest';
import {
  filterSettings,
  highlightMatch,
  getResolvedCategories,
  SETTINGS_ITEMS,
  SETTINGS_CATEGORIES,
  type SettingItem,
} from '../settings-search';

describe('settings-search', () => {
  describe('SETTINGS_ITEMS', () => {
    it('contains 13 settings items', () => {
      // Item count tracked against SETTINGS_ITEMS source; bump when adding/removing hubs.
      expect(SETTINGS_ITEMS).toHaveLength(13);
    });

    it('includes the Tasks settings hub (PG-191)', () => {
      const tasks = SETTINGS_ITEMS.find((item) => item.id === 'tasks');
      expect(tasks).toBeDefined();
      expect(tasks?.href).toBe('/tasks/task-settings');
    });

    it('each item has required fields', () => {
      for (const item of SETTINGS_ITEMS) {
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.description).toBeTruthy();
        expect(item.href).toMatch(/^\//);
        expect(item.icon).toBeTruthy();
        expect(item.color).toMatch(/^bg-/);
        expect(item.keywords.length).toBeGreaterThan(0);
      }
    });
  });

  describe('SETTINGS_CATEGORIES', () => {
    it('contains 4 categories', () => {
      expect(SETTINGS_CATEGORIES).toHaveLength(4);
    });

    it('all item IDs reference valid settings items', () => {
      const validIds = new Set(SETTINGS_ITEMS.map((i) => i.id));
      for (const cat of SETTINGS_CATEGORIES) {
        for (const id of cat.itemIds) {
          expect(validIds.has(id)).toBe(true);
        }
      }
    });
  });

  describe('filterSettings', () => {
    it('returns all items when query is empty string', () => {
      const result = filterSettings('', SETTINGS_ITEMS);
      expect(result).toHaveLength(SETTINGS_ITEMS.length);
    });

    it('returns all items when query is whitespace only', () => {
      const result = filterSettings('   ', SETTINGS_ITEMS);
      expect(result).toHaveLength(SETTINGS_ITEMS.length);
    });

    it('filters by exact title match (case-insensitive)', () => {
      // Item ID was pluralised from 'account' to 'accounts'.
      const result = filterSettings('account', SETTINGS_ITEMS);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe('accounts');
    });

    it('filters by partial title match', () => {
      const result = filterSettings('notif', SETTINGS_ITEMS);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((i) => i.id === 'notifications')).toBe(true);
    });

    it('filters by description match', () => {
      const result = filterSettings('third-party', SETTINGS_ITEMS);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe('integrations');
    });

    it('filters by keyword match', () => {
      const result = filterSettings('slack', SETTINGS_ITEMS);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe('integrations');
    });

    it('returns empty array when no items match', () => {
      const result = filterSettings('zzzznonexistent', SETTINGS_ITEMS);
      expect(result).toHaveLength(0);
    });

    it('scores title matches higher than description matches', () => {
      // "security" matches both the Security title AND Account description
      const result = filterSettings('security', SETTINGS_ITEMS);
      expect(result.length).toBeGreaterThan(0);
      // Security item should rank first (title match has higher weight)
      expect(result[0].id).toBe('security');
    });

    it('scores description matches higher than keyword matches', () => {
      // "password" is in Account description AND Security keywords
      const result = filterSettings('password', SETTINGS_ITEMS);
      expect(result.length).toBeGreaterThan(0);
      // Account should rank first (description match has weight 2 vs keyword weight 1)
      expect(result[0].id).toBe('account');
    });

    it('handles special characters in query', () => {
      const result = filterSettings('(test)', SETTINGS_ITEMS);
      expect(result).toHaveLength(0); // no match, but no error
    });

    it('handles ampersand in query', () => {
      const result = filterSettings('&', SETTINGS_ITEMS);
      // Should not throw
      expect(Array.isArray(result)).toBe(true);
    });

    it('works with custom items array', () => {
      const customItems: SettingItem[] = [
        {
          id: 'test',
          title: 'Test Setting',
          description: 'A test setting',
          href: '/test',
          icon: 'test',
          color: 'bg-gray-500',
          keywords: ['testing'],
        },
      ];
      const result = filterSettings('test', customItems);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test');
    });
  });

  describe('highlightMatch', () => {
    it('returns correct segments for a single match', () => {
      const result = highlightMatch('Account Settings', 'account');
      expect(result).toEqual([
        { text: 'Account', highlighted: true },
        { text: ' Settings', highlighted: false },
      ]);
    });

    it('returns correct segments for middle match', () => {
      const result = highlightMatch('My Account Page', 'account');
      expect(result).toEqual([
        { text: 'My ', highlighted: false },
        { text: 'Account', highlighted: true },
        { text: ' Page', highlighted: false },
      ]);
    });

    it('returns whole text unhighlighted for no match', () => {
      const result = highlightMatch('Account Settings', 'xyz');
      expect(result).toEqual([{ text: 'Account Settings', highlighted: false }]);
    });

    it('returns whole text unhighlighted for empty query', () => {
      const result = highlightMatch('Account Settings', '');
      expect(result).toEqual([{ text: 'Account Settings', highlighted: false }]);
    });

    it('returns whole text unhighlighted for whitespace query', () => {
      const result = highlightMatch('Account Settings', '   ');
      expect(result).toEqual([{ text: 'Account Settings', highlighted: false }]);
    });

    it('handles case-insensitive matching', () => {
      const result = highlightMatch('Account Settings', 'ACCOUNT');
      expect(result[0].highlighted).toBe(true);
      // Preserves original casing
      expect(result[0].text).toBe('Account');
    });
  });

  describe('getResolvedCategories', () => {
    it('returns all 4 categories when no search query', () => {
      const categories = getResolvedCategories();
      expect(categories).toHaveLength(4);
    });

    it('returns categories with resolved item objects', () => {
      const categories = getResolvedCategories();
      for (const cat of categories) {
        expect(cat.id).toBeTruthy();
        expect(cat.title).toBeTruthy();
        for (const item of cat.items) {
          expect(item.id).toBeTruthy();
          expect(item.title).toBeTruthy();
        }
      }
    });

    it('filters categories based on search query', () => {
      const categories = getResolvedCategories('security');
      // Should include at least Security category
      expect(categories.some((c) => c.id === 'security')).toBe(true);
    });

    it('hides empty categories during search', () => {
      const categories = getResolvedCategories('pipeline');
      // Only AI & Automation category should have items
      for (const cat of categories) {
        expect(cat.items.length).toBeGreaterThan(0);
      }
    });

    it('returns empty array when no items match search', () => {
      const categories = getResolvedCategories('zzzznonexistent');
      expect(categories).toHaveLength(0);
    });
  });
});
