# Home Page Analytics Tracking Plan

**Task**: PG-167 **Module**: `apps/web/src/lib/analytics.ts` **Transport**:
`apps/web/src/lib/shared/tracking-pixel.ts` (`trackEvent()`)

## Overview

All authenticated home page sections emit typed analytics events to measure user
engagement, feature discovery, and personalization behavior. Events flow through
the existing `trackEvent()` API which dispatches to GTM/GA4, Facebook Pixel, and
LinkedIn Insight Tag. Do Not Track preferences are respected automatically.

## Event Catalog

### 1. Welcome Banner

| Event                      | Trigger                                          | Required Properties     | Business Purpose                                            |
| -------------------------- | ------------------------------------------------ | ----------------------- | ----------------------------------------------------------- |
| `home.welcome_cta_clicked` | User clicks "View Schedule" or "Go to Dashboard" | `cta_label`, `cta_href` | Measure which CTAs drive navigation; optimize banner layout |

### 2. AI Daily Insights

| Event                            | Trigger                     | Required Properties                              | Business Purpose                                                    |
| -------------------------------- | --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `home.insight_clicked`           | User clicks an InsightCard  | `insight_id`, `insight_type`, `insight_priority` | Measure AI adoption rate; identify which insight types drive action |
| `home.insights_view_all_clicked` | User clicks "View All" link | —                                                | Track navigation depth; demand for expanded insights view           |

### 3. Quick Actions

| Event                                | Trigger                                | Required Properties                           | Business Purpose                                             |
| ------------------------------------ | -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `home.quick_action_clicked`          | User clicks a quick action button/link | `action_id`, `action_label`, `is_coming_soon` | Feature discovery patterns; most-used actions inform roadmap |
| `home.quick_actions_settings_opened` | User opens quick actions settings      | —                                             | Personalization engagement                                   |
| `home.quick_actions_settings_saved`  | User saves quick actions settings      | `enabled_count`                               | Measure personalization depth                                |

### 4. Activity Feed

| Event                        | Trigger                       | Required Properties              | Business Purpose                                          |
| ---------------------------- | ----------------------------- | -------------------------------- | --------------------------------------------------------- |
| `home.feed_filter_changed`   | User changes feed type filter | `filter_value`, `previous_value` | Identify most-viewed feed types; personalization patterns |
| `home.feed_view_all_clicked` | User clicks "View All" link   | —                                | Track navigation to full activity page                    |

### 5. Today's Focus (Goal)

| Event                       | Trigger                        | Required Properties         | Business Purpose                               |
| --------------------------- | ------------------------------ | --------------------------- | ---------------------------------------------- |
| `home.goal_settings_opened` | User opens goal settings modal | —                           | Goal engagement rate                           |
| `home.goal_settings_saved`  | User saves goal settings       | `goal_type`, `target_value` | Most popular goal types; typical target values |

### 6. Pinned Items

| Event                             | Trigger                        | Required Properties        | Business Purpose                                  |
| --------------------------------- | ------------------------------ | -------------------------- | ------------------------------------------------- |
| `home.pinned_item_clicked`        | User clicks a pinned item      | `entity_type`, `entity_id` | Most-accessed entity types; personalization value |
| `home.pinned_item_unpinned`       | User unpins an item            | `entity_type`              | Churn from pinned items                           |
| `home.pinned_items_reordered`     | User drags to reorder          | `item_count`               | Personalization engagement depth                  |
| `home.pinned_nav_settings_opened` | User opens pinned nav settings | —                          | Settings engagement                               |
| `home.pinned_nav_settings_saved`  | User saves pinned nav settings | `enabled_group_count`      | Navigation customization patterns                 |

## Implementation Notes

- All events use `category: 'home'` for dashboard filtering
- Event names follow `snake_case` with `home.` namespace prefix
- No PII in properties — entity IDs only, no names or emails
- All tracking calls are synchronous fire-and-forget (non-blocking)
- DNT (Do Not Track) respected via `tracking-pixel.ts` `isTrackingAllowed()`

## Component Mapping

| Component                   | Events Fired                                                                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthenticatedHomePage.tsx` | welcome_cta_clicked, insights_view_all_clicked, quick_action_clicked, quick_actions_settings_opened, feed_filter_changed, feed_view_all_clicked, goal_settings_opened, pinned_nav_settings_opened, pinned_items_reordered, pinned_item_unpinned |
| `InsightCard.tsx`           | insight_clicked (via onClick prop)                                                                                                                                                                                                              |
| `DraggablePinnedItem.tsx`   | pinned_item_clicked (via onItemClick prop)                                                                                                                                                                                                      |
| `GoalSettingsModal.tsx`     | goal_settings_saved                                                                                                                                                                                                                             |
| `PinnedItemsSheet.tsx`      | quick_actions_settings_saved, pinned_nav_settings_saved                                                                                                                                                                                         |
