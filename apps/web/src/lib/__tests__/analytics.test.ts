/**
 * Unit tests for home page analytics module
 *
 * Task: PG-167 — Analytics tracking plan for home page
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTrackEvent } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
}));

vi.mock('@/lib/shared/tracking-pixel', () => ({
  trackEvent: mockTrackEvent,
}));

import {
  trackHomeEvent,
  trackWelcomeCtaClick,
  trackInsightClick,
  trackInsightsViewAllClick,
  trackQuickActionClick,
  trackQuickActionsSettingsOpened,
  trackQuickActionsSettingsSaved,
  trackFeedFilterChange,
  trackFeedViewAllClick,
  trackGoalSettingsOpened,
  trackGoalSettingsSaved,
  trackPinnedItemClick,
  trackPinnedItemUnpin,
  trackPinnedItemsReorder,
  trackPinnedNavSettingsOpened,
  trackPinnedNavSettingsSaved,
} from '../analytics';

describe('Home Page Analytics', () => {
  beforeEach(() => {
    mockTrackEvent.mockClear();
  });

  describe('trackHomeEvent', () => {
    it('calls trackEvent with correct name, category, and properties', () => {
      trackHomeEvent('home.welcome_cta_clicked', { cta_label: 'test' });
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.welcome_cta_clicked',
        category: 'home',
        properties: { cta_label: 'test' },
      });
    });

    it('calls trackEvent without properties when none provided', () => {
      trackHomeEvent('home.feed_view_all_clicked');
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.feed_view_all_clicked',
        category: 'home',
        properties: undefined,
      });
    });
  });

  // =========================================================================
  // Welcome Banner
  // =========================================================================

  describe('trackWelcomeCtaClick', () => {
    it('tracks welcome CTA click with label and href', () => {
      trackWelcomeCtaClick('View Schedule', '/calendar');
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.welcome_cta_clicked',
        category: 'home',
        properties: { cta_label: 'View Schedule', cta_href: '/calendar' },
      });
    });
  });

  // =========================================================================
  // AI Insights
  // =========================================================================

  describe('trackInsightClick', () => {
    it('tracks insight click with id, type, and priority', () => {
      trackInsightClick('ins-123', 'opportunity', 'high');
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.insight_clicked',
        category: 'home',
        properties: {
          insight_id: 'ins-123',
          insight_type: 'opportunity',
          insight_priority: 'high',
        },
      });
    });
  });

  describe('trackInsightsViewAllClick', () => {
    it('tracks insights view all click', () => {
      trackInsightsViewAllClick();
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.insights_view_all_clicked',
        category: 'home',
        properties: undefined,
      });
    });
  });

  // =========================================================================
  // Quick Actions
  // =========================================================================

  describe('trackQuickActionClick', () => {
    it('tracks quick action click with id, label, and coming soon flag', () => {
      trackQuickActionClick('action-call', 'Log Call', true);
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.quick_action_clicked',
        category: 'home',
        properties: {
          action_id: 'action-call',
          action_label: 'Log Call',
          is_coming_soon: true,
        },
      });
    });
  });

  describe('trackQuickActionsSettingsOpened', () => {
    it('tracks quick actions settings opened', () => {
      trackQuickActionsSettingsOpened();
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.quick_actions_settings_opened',
        category: 'home',
        properties: undefined,
      });
    });
  });

  describe('trackQuickActionsSettingsSaved', () => {
    it('tracks quick actions settings saved with count', () => {
      trackQuickActionsSettingsSaved(5);
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.quick_actions_settings_saved',
        category: 'home',
        properties: { enabled_count: 5 },
      });
    });
  });

  // =========================================================================
  // Activity Feed
  // =========================================================================

  describe('trackFeedFilterChange', () => {
    it('tracks feed filter change with current and previous values', () => {
      trackFeedFilterChange('calls', 'all');
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.feed_filter_changed',
        category: 'home',
        properties: { filter_value: 'calls', previous_value: 'all' },
      });
    });
  });

  describe('trackFeedViewAllClick', () => {
    it('tracks feed view all click', () => {
      trackFeedViewAllClick();
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.feed_view_all_clicked',
        category: 'home',
        properties: undefined,
      });
    });
  });

  // =========================================================================
  // Goal
  // =========================================================================

  describe('trackGoalSettingsOpened', () => {
    it('tracks goal settings opened', () => {
      trackGoalSettingsOpened();
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.goal_settings_opened',
        category: 'home',
        properties: undefined,
      });
    });
  });

  describe('trackGoalSettingsSaved', () => {
    it('tracks goal settings saved with type and target', () => {
      trackGoalSettingsSaved('revenue', 5000);
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.goal_settings_saved',
        category: 'home',
        properties: { goal_type: 'revenue', target_value: 5000 },
      });
    });
  });

  // =========================================================================
  // Pinned Items
  // =========================================================================

  describe('trackPinnedItemClick', () => {
    it('tracks pinned item click with entity type and id', () => {
      trackPinnedItemClick('lead', 'lead-456');
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.pinned_item_clicked',
        category: 'home',
        properties: { entity_type: 'lead', entity_id: 'lead-456' },
      });
    });
  });

  describe('trackPinnedItemUnpin', () => {
    it('tracks pinned item unpin with entity type', () => {
      trackPinnedItemUnpin('contact');
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.pinned_item_unpinned',
        category: 'home',
        properties: { entity_type: 'contact' },
      });
    });
  });

  describe('trackPinnedItemsReorder', () => {
    it('tracks pinned items reorder with count', () => {
      trackPinnedItemsReorder(3);
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.pinned_items_reordered',
        category: 'home',
        properties: { item_count: 3 },
      });
    });
  });

  describe('trackPinnedNavSettingsOpened', () => {
    it('tracks pinned nav settings opened', () => {
      trackPinnedNavSettingsOpened();
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.pinned_nav_settings_opened',
        category: 'home',
        properties: undefined,
      });
    });
  });

  describe('trackPinnedNavSettingsSaved', () => {
    it('tracks pinned nav settings saved with group count', () => {
      trackPinnedNavSettingsSaved(4);
      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: 'home.pinned_nav_settings_saved',
        category: 'home',
        properties: { enabled_group_count: 4 },
      });
    });
  });
});
