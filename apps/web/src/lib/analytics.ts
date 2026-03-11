/**
 * Home Page Analytics — Typed event tracking functions
 *
 * Wraps the generic trackEvent() from tracking-pixel.ts with
 * home-page-specific typed functions for each section.
 *
 * Task: PG-167 — Analytics tracking plan for home page
 */

import { trackEvent } from '@/lib/shared/tracking-pixel';

// =============================================================================
// Event Name Type
// =============================================================================

export type HomeAnalyticsEvent =
  | 'home.welcome_cta_clicked'
  | 'home.insight_viewed'
  | 'home.insight_clicked'
  | 'home.insights_view_all_clicked'
  | 'home.quick_action_clicked'
  | 'home.quick_actions_settings_opened'
  | 'home.quick_actions_settings_saved'
  | 'home.feed_filter_changed'
  | 'home.feed_view_all_clicked'
  | 'home.goal_viewed'
  | 'home.goal_settings_opened'
  | 'home.goal_settings_saved'
  | 'home.pinned_item_clicked'
  | 'home.pinned_item_unpinned'
  | 'home.pinned_items_reordered'
  | 'home.pinned_nav_settings_opened'
  | 'home.pinned_nav_settings_saved';

// =============================================================================
// Core Tracking Function
// =============================================================================

export function trackHomeEvent(
  name: HomeAnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  trackEvent({ name, category: 'home', properties });
}

// =============================================================================
// Welcome Banner
// =============================================================================

export function trackWelcomeCtaClick(ctaLabel: string, ctaHref: string): void {
  trackHomeEvent('home.welcome_cta_clicked', { cta_label: ctaLabel, cta_href: ctaHref });
}

// =============================================================================
// AI Insights
// =============================================================================

export function trackInsightClick(insightId: string, type: string, priority: string): void {
  trackHomeEvent('home.insight_clicked', {
    insight_id: insightId,
    insight_type: type,
    insight_priority: priority,
  });
}

export function trackInsightsViewAllClick(): void {
  trackHomeEvent('home.insights_view_all_clicked');
}

// =============================================================================
// Quick Actions
// =============================================================================

export function trackQuickActionClick(
  actionId: string,
  actionLabel: string,
  isComingSoon: boolean,
): void {
  trackHomeEvent('home.quick_action_clicked', {
    action_id: actionId,
    action_label: actionLabel,
    is_coming_soon: isComingSoon,
  });
}

export function trackQuickActionsSettingsOpened(): void {
  trackHomeEvent('home.quick_actions_settings_opened');
}

export function trackQuickActionsSettingsSaved(enabledCount: number): void {
  trackHomeEvent('home.quick_actions_settings_saved', { enabled_count: enabledCount });
}

// =============================================================================
// Activity Feed
// =============================================================================

export function trackFeedFilterChange(filterValue: string, previousValue: string): void {
  trackHomeEvent('home.feed_filter_changed', {
    filter_value: filterValue,
    previous_value: previousValue,
  });
}

export function trackFeedViewAllClick(): void {
  trackHomeEvent('home.feed_view_all_clicked');
}

// =============================================================================
// Today's Focus / Goal
// =============================================================================

export function trackGoalSettingsOpened(): void {
  trackHomeEvent('home.goal_settings_opened');
}

export function trackGoalSettingsSaved(goalType: string, targetValue: number): void {
  trackHomeEvent('home.goal_settings_saved', { goal_type: goalType, target_value: targetValue });
}

// =============================================================================
// Pinned Items
// =============================================================================

export function trackPinnedItemClick(entityType: string, entityId: string): void {
  trackHomeEvent('home.pinned_item_clicked', { entity_type: entityType, entity_id: entityId });
}

export function trackPinnedItemUnpin(entityType: string): void {
  trackHomeEvent('home.pinned_item_unpinned', { entity_type: entityType });
}

export function trackPinnedItemsReorder(itemCount: number): void {
  trackHomeEvent('home.pinned_items_reordered', { item_count: itemCount });
}

export function trackPinnedNavSettingsOpened(): void {
  trackHomeEvent('home.pinned_nav_settings_opened');
}

export function trackPinnedNavSettingsSaved(enabledGroupCount: number): void {
  trackHomeEvent('home.pinned_nav_settings_saved', { enabled_group_count: enabledGroupCount });
}
