# Activity Feed Unification — Tracking

**Date**: 2026-03-09 **Related audit**: `docs/audit/dashboard-wiring-audit.md`
(Section 8) **Branch**: `sprint0/codex-run`

---

## Context

Two independent activity feed systems existed:

- **System A** (`useActivityFeed`): Server-fetched, cursor-paginated,
  WebSocket-invalidated. Used by 8 surfaces.
- **System B** (`useActivitySubscription`): Push-only, no initial data, manual
  state. Used by 1 widget.

System B is fully redundant. This tracks the unification.

---

## Changes

### 1a. Add CASE + DOCUMENT to domain entity types

- [x] `packages/domain/src/activity-feed/ActivityFeedConstants.ts` — add
      `'CASE'`, `'DOCUMENT'` to `ACTIVITY_FEED_ENTITY_TYPES`
- [x] Rebuild domain dist

### 1b. Add CASE + DOCUMENT sources in repository

- [x] `packages/adapters/src/repositories/PrismaActivityFeedRepository.ts` — add
      entity source mappings

### 1c. Fix TASK entity (silent bug — empty sources)

- [x] `packages/adapters/src/repositories/PrismaActivityFeedRepository.ts` — add
      TASK sources to `entitySourceMap`

### 2. Rewire RecentActivityWidget to System A

- [x] `apps/web/src/components/dashboard/widgets/RecentActivityWidget.tsx` —
      replace `useActivitySubscription` with `useActivityFeed`
- [x] `apps/web/src/components/dashboard/widgets/__tests__/RecentActivityWidget.test.tsx`
      — update mocks and sample data shape
- [x] Map `actor?.name` → agentName, drop `dateLabel`, synthesize connection
      status
- [x] Add all 17 activity types to `activityTypeConfig`

### 3. Wire /cases/[id] Activities tab

- [x] `apps/web/src/components/cases/CaseDetail.tsx` — add
      `<ActivityFeed entityType="CASE">` to Activities tab alongside
      DeadlineTracker

### 4. Wire /documents/[id] with Activity tab

- [x] `apps/web/src/app/documents/[id]/page.tsx` — add Activity tab with
      `<ActivityFeed entityType="DOCUMENT">`

### 5. Remove System B (use-subscription.ts)

- [x] Delete `apps/web/src/hooks/use-subscription.ts`
- [x] `apps/web/vitest.setup.ts` — remove
      `vi.mock('@/hooks/use-subscription', ...)` block
- [x] Delete `apps/web/src/hooks/__tests__/use-subscription.test.ts`
- [x] Delete
      `apps/web/src/hooks/__tests__/use-subscription.supplementary.test.ts`
- [x] Delete
      `apps/web/src/hooks/__tests__/use-subscription.supplementary2.test.ts`
- [x] Delete `apps/web/src/__tests__/use-subscription.additional.test.ts`

### 6. Wire governance pages to analytics.recentActivity

- [x] `apps/web/src/app/governance/page.tsx` — replace hardcoded
      `recentActivity` with `trpc.analytics.recentActivity`
- [x] `apps/web/src/app/governance/compliance/page.tsx` — same

---

### 7. Fix /contacts/[id] Overview tab — use unified feed

- [x] `apps/web/src/app/contacts/[id]/page.tsx` — Overview tab "Recent Activity"
      was reading from `apiContact.activities` (legacy) with custom inline
      rendering; replaced with
      `useActivityFeed({ entityType: 'CONTACT', entityId, limit: 3 })` +
      `<ActivityFeedItem>`, matching RecentActivityWidget pattern

---

## Not in scope

- `/calendar/[id]` — appointments are events themselves, not entities that
  accumulate activity
- `/email/[id]` — emails are events/sources, not entities
- Calendar static Timeline — separate concern (hardcoded metadata, not
  ActivityFeed)

---

## Verification

After all changes:

1. `pnpm typecheck` — zero errors
2. `npx vitest run` — affected tests pass
3. `RecentActivityWidget` shows real historical data on mount
4. `/cases/[id]` Activities tab shows unified feed
5. `/documents/[id]` Activity tab shows unified feed
6. `/tasks/[id]` ActivityFeed no longer silently empty (repo backed)
7. Governance pages show real recent activity from API
8. No remaining imports of `use-subscription.ts`
