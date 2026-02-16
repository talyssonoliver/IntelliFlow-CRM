/**
 * Supplementary tests for AppSidebar.tsx
 *
 * Tests navigation configuration, menu item logic, active state
 * calculation, module color themes, and badge rendering logic.
 *
 * No rendering - tests pure logic only.
 */
import { describe, it, expect } from 'vitest';
import { MODULE_COLORS } from '../icon-reference';
import type {
  SidebarItem,
  SidebarConfig,
  SidebarSection,
  SidebarAnnouncement,
} from '../sidebar-types';

// ---------------------------------------------------------------------------
// isItemActive logic (extracted from AppSidebar)
// ---------------------------------------------------------------------------
function isItemActive(item: SidebarItem, pathname: string, searchParams: URLSearchParams): boolean {
  const itemUrl = new URL(item.href, 'http://localhost');
  const itemPath = itemUrl.pathname;
  const itemParams = itemUrl.searchParams;

  // Check if paths match
  if (pathname !== itemPath && !pathname?.startsWith(itemPath + '/')) {
    return false;
  }

  // For items with query params, check if they match
  if (itemParams.toString()) {
    for (const [key, value] of itemParams.entries()) {
      if (searchParams.get(key) !== value) {
        return false;
      }
    }
    return true;
  }

  // For items without params, only active if no relevant params in URL
  const view = searchParams.get('view');
  const segment = searchParams.get('segment');
  return !view && !segment;
}

// ---------------------------------------------------------------------------
// Badge rendering logic (extracted from SidebarItemComponent)
// ---------------------------------------------------------------------------
function formatBadge(badge: number | undefined): string | null {
  if (badge === undefined || badge <= 0) return null;
  return badge > 99 ? '99+' : String(badge);
}

// ---------------------------------------------------------------------------
// Module color lookup (mirrors AppSidebar useMemo)
// ---------------------------------------------------------------------------
type ModuleId = keyof typeof MODULE_COLORS;

function getModuleColor(moduleId: string) {
  return MODULE_COLORS[moduleId as ModuleId] || MODULE_COLORS.dashboard;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AppSidebar logic', () => {
  // ===================== isItemActive =====================
  describe('isItemActive', () => {
    it('exact path match without params returns true', () => {
      const item: SidebarItem = { id: '1', label: 'Leads', icon: 'group', href: '/leads' };
      expect(isItemActive(item, '/leads', new URLSearchParams())).toBe(true);
    });

    it('child path matches parent href', () => {
      const item: SidebarItem = { id: '1', label: 'Leads', icon: 'group', href: '/leads' };
      expect(isItemActive(item, '/leads/123', new URLSearchParams())).toBe(true);
    });

    it('completely different path returns false', () => {
      const item: SidebarItem = { id: '1', label: 'Leads', icon: 'group', href: '/leads' };
      expect(isItemActive(item, '/contacts', new URLSearchParams())).toBe(false);
    });

    it('path matching but with view param returns false', () => {
      const item: SidebarItem = { id: '1', label: 'Leads', icon: 'group', href: '/leads' };
      const params = new URLSearchParams('view=kanban');
      expect(isItemActive(item, '/leads', params)).toBe(false);
    });

    it('path matching but with segment param returns false', () => {
      const item: SidebarItem = { id: '1', label: 'Leads', icon: 'group', href: '/leads' };
      const params = new URLSearchParams('segment=hot');
      expect(isItemActive(item, '/leads', params)).toBe(false);
    });

    it('item with query params matches when URL has same params', () => {
      const item: SidebarItem = {
        id: '1',
        label: 'Hot Leads',
        icon: 'fire',
        href: '/leads?segment=hot',
      };
      const params = new URLSearchParams('segment=hot');
      expect(isItemActive(item, '/leads', params)).toBe(true);
    });

    it('item with query params does not match when URL has different param value', () => {
      const item: SidebarItem = {
        id: '1',
        label: 'Hot Leads',
        icon: 'fire',
        href: '/leads?segment=hot',
      };
      const params = new URLSearchParams('segment=cold');
      expect(isItemActive(item, '/leads', params)).toBe(false);
    });

    it('item with query params does not match when URL has no params', () => {
      const item: SidebarItem = {
        id: '1',
        label: 'Hot Leads',
        icon: 'fire',
        href: '/leads?segment=hot',
      };
      expect(isItemActive(item, '/leads', new URLSearchParams())).toBe(false);
    });

    it('item with multiple query params requires all to match', () => {
      const item: SidebarItem = {
        id: '1',
        label: 'View',
        icon: 'view',
        href: '/leads?view=kanban&segment=hot',
      };
      const params = new URLSearchParams('view=kanban&segment=hot');
      expect(isItemActive(item, '/leads', params)).toBe(true);
    });

    it('item with multiple query params fails if one is missing', () => {
      const item: SidebarItem = {
        id: '1',
        label: 'View',
        icon: 'view',
        href: '/leads?view=kanban&segment=hot',
      };
      const params = new URLSearchParams('view=kanban');
      expect(isItemActive(item, '/leads', params)).toBe(false);
    });

    it('partial path match (prefix overlap) returns false', () => {
      const item: SidebarItem = { id: '1', label: 'Leads', icon: 'group', href: '/leads' };
      // '/leadsettings' starts with '/lead' but is not a child path
      expect(isItemActive(item, '/leadsettings', new URLSearchParams())).toBe(false);
    });

    it('root path item', () => {
      const item: SidebarItem = { id: '1', label: 'Home', icon: 'home', href: '/' };
      expect(isItemActive(item, '/', new URLSearchParams())).toBe(true);
    });
  });

  // ===================== formatBadge =====================
  describe('badge formatting', () => {
    it('returns null for undefined badge', () => {
      expect(formatBadge(undefined)).toBeNull();
    });

    it('returns null for zero badge', () => {
      expect(formatBadge(0)).toBeNull();
    });

    it('returns null for negative badge', () => {
      expect(formatBadge(-1)).toBeNull();
    });

    it('returns string for positive badge', () => {
      expect(formatBadge(5)).toBe('5');
    });

    it('returns "99+" for badge over 99', () => {
      expect(formatBadge(100)).toBe('99+');
    });

    it('returns "99" for badge exactly 99', () => {
      expect(formatBadge(99)).toBe('99');
    });

    it('returns "99+" for very large badge', () => {
      expect(formatBadge(9999)).toBe('99+');
    });

    it('returns "1" for badge of 1', () => {
      expect(formatBadge(1)).toBe('1');
    });
  });

  // ===================== Module color lookup =====================
  describe('module color lookup', () => {
    it('returns leads color for "leads" moduleId', () => {
      const color = getModuleColor('leads');
      expect(color.text).toContain('blue');
    });

    it('returns deals color for "deals" moduleId', () => {
      const color = getModuleColor('deals');
      expect(color.text).toContain('amber');
    });

    it('returns tickets color for "tickets" moduleId', () => {
      const color = getModuleColor('tickets');
      expect(color.text).toContain('rose');
    });

    it('returns governance color for "governance" moduleId', () => {
      const color = getModuleColor('governance');
      expect(color.text).toContain('emerald');
    });

    it('returns dashboard (default) for unknown moduleId', () => {
      const color = getModuleColor('nonexistent');
      expect(color).toEqual(MODULE_COLORS.dashboard);
    });

    it('returns analytics color for "analytics" moduleId', () => {
      const color = getModuleColor('analytics');
      expect(color.text).toContain('indigo');
    });

    it('all module colors have iconBg and text', () => {
      for (const [, color] of Object.entries(MODULE_COLORS)) {
        expect(color.iconBg).toBeDefined();
        expect(color.text).toBeDefined();
      }
    });
  });

  // ===================== SidebarConfig validation =====================
  describe('SidebarConfig shape', () => {
    it('accepts minimal valid config', () => {
      const config: SidebarConfig = {
        moduleId: 'leads',
        moduleTitle: 'Leads',
        moduleIcon: 'group',
        sections: [],
      };
      expect(config.moduleId).toBe('leads');
      expect(config.sections).toHaveLength(0);
    });

    it('accepts config with settings', () => {
      const config: SidebarConfig = {
        moduleId: 'leads',
        moduleTitle: 'Leads',
        moduleIcon: 'group',
        sections: [],
        settingsHref: '/settings/leads',
        showSettings: true,
      };
      expect(config.settingsHref).toBe('/settings/leads');
      expect(config.showSettings).toBe(true);
    });

    it('settings are hidden when showSettings is false', () => {
      const config: SidebarConfig = {
        moduleId: 'leads',
        moduleTitle: 'Leads',
        moduleIcon: 'group',
        sections: [],
        settingsHref: '/settings/leads',
        showSettings: false,
      };
      // logic: config.showSettings !== false && config.settingsHref
      const showSettings = config.showSettings !== false && !!config.settingsHref;
      expect(showSettings).toBe(false);
    });

    it('settings shown when showSettings undefined but settingsHref present', () => {
      const config: SidebarConfig = {
        moduleId: 'leads',
        moduleTitle: 'Leads',
        moduleIcon: 'group',
        sections: [],
        settingsHref: '/settings/leads',
      };
      const showSettings = config.showSettings !== false && !!config.settingsHref;
      expect(showSettings).toBe(true);
    });
  });

  // ===================== SidebarItem isSegment logic =====================
  describe('isSegment detection', () => {
    it('item with color is a segment', () => {
      const item: SidebarItem = {
        id: '1',
        label: 'Hot',
        icon: 'dot',
        href: '/leads?segment=hot',
        color: 'text-red-500',
      };
      expect(Boolean(item.color)).toBe(true);
    });

    it('item without color is not a segment', () => {
      const item: SidebarItem = { id: '1', label: 'All', icon: 'list', href: '/leads' };
      expect(Boolean(item.color)).toBe(false);
    });
  });

  // ===================== SidebarAnnouncement shape =====================
  describe('SidebarAnnouncement', () => {
    it('accepts valid announcement', () => {
      const announcement: SidebarAnnouncement = {
        id: 'ann-1',
        headline: 'New Feature',
        description: 'Check out the new dashboard',
        actionText: 'Learn More',
        actionHref: '/blog/new-feature',
        icon: 'auto_awesome',
      };
      expect(announcement.id).toBe('ann-1');
      expect(announcement.icon).toBe('auto_awesome');
    });

    it('announcement icon is optional', () => {
      const announcement: SidebarAnnouncement = {
        id: 'ann-2',
        headline: 'Update',
        description: 'desc',
        actionText: 'Go',
        actionHref: '/update',
      };
      expect(announcement.icon).toBeUndefined();
    });
  });

  // ===================== Section structure =====================
  describe('SidebarSection structure', () => {
    it('section with multiple items', () => {
      const section: SidebarSection = {
        id: 'main',
        title: 'Main',
        items: [
          { id: '1', label: 'All', icon: 'list', href: '/leads' },
          { id: '2', label: 'My', icon: 'person', href: '/leads?view=my' },
        ],
      };
      expect(section.items).toHaveLength(2);
    });

    it('empty section is valid', () => {
      const section: SidebarSection = {
        id: 'empty',
        title: 'Empty',
        items: [],
      };
      expect(section.items).toHaveLength(0);
    });
  });
});
