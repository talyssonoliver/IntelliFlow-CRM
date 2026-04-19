# Empty State Pattern

**Status**: Authoritative (single source of truth — do not duplicate elsewhere)
**Owner**: Growth FE (STOA-Foundation) **Origin**: PG-195 follow-on (2026-04-14)
— `<EmptyState>` component was widely used (97 files) but `entity=` auto-wiring
was reached by only 8/97 call sites, leaving the 30 curated illustrations
underused. **Last updated**: 2026-04-14

This document is the **only** place where the empty-state policy is defined.
Every other doc, CLAUDE.md, skill, or review checklist that mentions empty
states MUST link here instead of restating rules.

---

## The rule

Every CRM-entity zero state renders through the shared `<EmptyState>` from
`@intelliflow/ui` with the `entity=` prop. The component auto-wires the
illustration, title, description, CTA label, and hotkey from
`packages/ui/src/components/entity-empty-state-config.ts` (30 entities) and
`packages/ui/src/components/empty-state-illustrations.tsx` (30 SVG
illustrations).

```tsx
import { EmptyState } from '@intelliflow/ui';

// 1. Entity mode (canonical — auto-wired illustration, title, CTA)
<EmptyState entity="leads" onCreate={handleCreate} />

// 2. Variant override (same entity, different state)
<EmptyState entity="deals" variant="filtered" />

// 3. Prop override (keep the illustration, customise copy)
<EmptyState entity="tickets" title="No open tickets" description="You're all caught up." />
```

Pass `entity` before any other prop. When `entity` is set, the component pulls
its defaults from the config; explicit `title`/`description`/`ctaLabel` props
still override, but you should only override with intent.

## The 30 available entities

The `EmptyStateEntity` union is defined in
`packages/ui/src/components/entity-empty-state-config.ts:5-35`. Each entity maps
to one illustration + one default config.

| Entity            | When to use                                       |
| ----------------- | ------------------------------------------------- |
| `leads`           | Lead list pages, lead 360 activity sections       |
| `contacts`        | Contact list / 360 / relationship panes           |
| `accounts`        | Account list / 360 / hierarchy views              |
| `deals`           | Deal list / Kanban / forecast                     |
| `tickets`         | Ticket list / queue / SLA views                   |
| `cases`           | Case list / timeline / detail tabs                |
| `tasks`           | Task list / My Tasks / entity task tabs           |
| `appointments`    | Calendar, appointment lists, entity schedule tabs |
| `activity`        | Generic activity feed (cross-entity)              |
| `timeline`        | Entity timeline tab (chronological events)        |
| `notes`           | Notes tab / pinned notes panel                    |
| `chats`           | Chat/conversation list                            |
| `emails`          | Email inbox / entity email tab                    |
| `comments`        | Comments thread / review queue                    |
| `files`           | File attachments / uploads                        |
| `documents`       | Signed documents / contract library               |
| `signatures`      | E-signature queue / pending signatures            |
| `invoices`        | Invoice list / billing history                    |
| `receipts`        | Receipt archive / expense evidence                |
| `payment-methods` | Saved cards / bank accounts                       |
| `subscriptions`   | Active/cancelled subscriptions                    |
| `products`        | Product catalog / line items                      |
| `reports`         | Saved reports / dashboard gallery                 |
| `insights`        | AI insight stream / daily digest                  |
| `notifications`   | Notification centre / unread list                 |
| `pinned`          | Pinned items panel (home, entity header)          |
| `agents`          | AI agent registry / agent approval queue          |
| `rules`           | Automation rules / workflow triggers              |
| `experiments`     | A/B experiments dashboard                         |
| `search`          | Global search no-results state                    |

## Variants

```ts
type EmptyStateVariant = 'empty' | 'selection' | 'filtered' | 'folder';
```

- `empty` (default) — no items exist at all.
- `selection` — nothing selected in a list-detail split view.
- `filtered` — items exist but none match the current search/filter.
- `folder` — a container (folder, category) has no items.

Use the variant closest to reality. `filtered` usually reads differently from
`empty` (you wrote the search query — you know it matched nothing), and
`selection` usually points the user back to the list.

## What is forbidden

- Inline `<svg>` illustrations inside a page or component to represent an
  entity's zero state. If one of the 30 entities fits, use it. If none fit,
  **add a new illustration to the shared library** — do not inline.
- Creating a parallel `MyFooIllustration` component outside
  `packages/ui/src/components/empty-state-illustrations.tsx`.
- Stub/placeholder empty states ("No data.", "Nothing here.") without leveraging
  the entity config. Entity mode gives you branded visuals, the right CTA label,
  and a hotkey hint for free.
- Using `<EmptyState>` without either `entity=` OR a full custom
  `title + description + illustration` trio. A title-only empty card is a
  design-system regression.

## When a genuine custom illustration is needed

If the feature is not an entity at all (e.g. onboarding success screens, error
recovery flows, upsell placeholders), do not force an entity value. Two
acceptable paths:

1. **Pass `illustration={<...>}`** with a one-off JSX node **only** if the
   feature is truly outside the CRM-entity model.
2. **Add a new entity to the library** if the concept will recur:
   - Add the entity name to the `EmptyStateEntity` union in
     `packages/ui/src/components/entity-empty-state-config.ts`.
   - Add a default config object to `ENTITY_EMPTY_STATE_CONFIG`.
   - Add a new illustration function to
     `packages/ui/src/components/empty-state-illustrations.tsx`.
   - Register it in the `ENTITY_ILLUSTRATIONS` map at the bottom of that file.
   - Export the new illustration from `packages/ui/src/components/index.ts`.
   - Add a row to the table above.

Path 2 is the default — parallel inline SVGs degrade the design system.

## Why this matters

- **Brand consistency**: every zero state reads the same way — identical
  spacing, stroke weights, tone, animation.
- **Discoverability**: the `entity=` prop pulls a sensible CTA label and hotkey,
  so users learn the shortcuts.
- **Maintenance**: one file (`empty-state-illustrations.tsx`) holds every SVG. A
  brand refresh swaps them globally — no hunt for inline SVGs.
- **Type safety**: `EmptyStateEntity` is a union of 30 string literals, so typos
  fail at compile time.

## How reviewers check compliance

- **Spec Phase 0.76 (Shared Component Audit)**: `EmptyState` is in the mandatory
  inventory; Round 2 proposals that describe a zero state must cite
  `REUSES: EmptyState entity='<one-of-30>'`.
- **Plan Reviewer category II**: any plan that names a list/detail/search
  surface and does not wire `<EmptyState entity='...' />` is flagged.
- **`/exec-gates` Gate 2d (Shared Component Reuse)**: a new JSX `<svg>` inside a
  page or component must be justified in writing or the gate blocks.

## Links

- Canonical component:
  [`packages/ui/src/components/empty-state.tsx`](../../packages/ui/src/components/empty-state.tsx)
- Entity config (titles, descriptions, CTAs, hotkeys):
  [`packages/ui/src/components/entity-empty-state-config.ts`](../../packages/ui/src/components/entity-empty-state-config.ts)
- Illustrations (30 SVGs):
  [`packages/ui/src/components/empty-state-illustrations.tsx`](../../packages/ui/src/components/empty-state-illustrations.tsx)
- Parent policy (icons): [`docs/design/ICON_USAGE.md`](./ICON_USAGE.md)
