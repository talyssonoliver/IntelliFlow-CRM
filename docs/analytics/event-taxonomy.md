# Event Taxonomy

## Principles

- Events are consistent, documented, and versioned
- Each event has required properties and a clear purpose

## Core Events (Initial)

- `account_created`
- `account_updated`
- `opportunity_created`
- `opportunity_stage_changed`
- `task_created`
- `task_completed`

## Required Properties

- `event_id`
- `timestamp`
- `actor_id`
- `entity_type`
- `entity_id`

## Home Page Events

17 typed events in the `home.*` namespace track user engagement across all
authenticated home page sections. Each event flows through `trackEvent()` in
`tracking-pixel.ts` with `category: 'home'`.

| Section | Events |
|---------|--------|
| Welcome Banner | `home.welcome_cta_clicked` |
| AI Insights | `home.insight_clicked`, `home.insights_view_all_clicked` |
| Quick Actions | `home.quick_action_clicked`, `home.quick_actions_settings_opened`, `home.quick_actions_settings_saved` |
| Activity Feed | `home.feed_filter_changed`, `home.feed_view_all_clicked` |
| Today's Focus | `home.goal_settings_opened`, `home.goal_settings_saved` |
| Pinned Items | `home.pinned_item_clicked`, `home.pinned_item_unpinned`, `home.pinned_items_reordered`, `home.pinned_nav_settings_opened`, `home.pinned_nav_settings_saved` |

**Module**: `apps/web/src/lib/analytics.ts`
**Full details**: [Home Page Tracking Plan](home-page-tracking-plan.md)
