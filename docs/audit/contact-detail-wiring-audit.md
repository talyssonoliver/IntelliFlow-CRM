# Contact Detail (Contact 360) — Wiring Audit

**Page**: `apps/web/src/app/contacts/[id]/page.tsx` (~2242 lines) **API**:
`apps/api/src/modules/contact/contact.router.ts` → `getById`, `logActivity`,
`search`, `stats` procedures **Date**: 2026-03-05 (created — comprehensive flow
analysis)

---

## Summary

| Category              | Wired  | Partially Wired | Not Wired |
| --------------------- | ------ | --------------- | --------- |
| Core Contact Data     | 10     | 3               | 4         |
| Activities / Timeline | 3      | 1               | 3         |
| AI Insights           | 5      | 2               | 1         |
| Notes                 | 2      | 0               | 1         |
| Files / Documents     | 0      | 0               | 2         |
| Emails                | 0      | 0               | 2         |
| Tasks                 | 2      | 0               | 0         |
| Deals                 | 2      | 0               | 1         |
| Tickets               | 0      | 0               | 1         |
| Sidebar Widgets       | 2      | 0               | 1         |
| Action Buttons        | 0      | 0               | 6         |
| Map / Location        | 0      | 0               | 1         |
| Owner Management      | 0      | 0               | 1         |
| **Total**             | **26** | **6**           | **24**    |

### Comprehensive Flow Analysis

| Category               | CRITICAL | HIGH   | MEDIUM | LOW    | Test Gaps |
| ---------------------- | -------- | ------ | ------ | ------ | --------- |
| Backend Security       | 3        | 5      | 4      | 2      | —         |
| Frontend UX            | 7        | 8      | 10     | 6      | —         |
| Integration / Workflow | 3        | 7      | 4      | 2      | —         |
| Domain / Validation    | 0        | 2      | 4      | 2      | —         |
| Test Coverage          | —        | —      | —      | —      | 10        |
| **Total**              | **13**   | **22** | **22** | **12** | **10**    |

**Grand total: 79 findings** (13 CRITICAL, 22 HIGH, 22 MEDIUM, 12 LOW, 10 test
gaps)

Legend:

- **Wired** = fetches real data from API/DB, displays correctly
- **Partially Wired** = fetches some data but has hardcoded fallbacks, missing
  fields, or divergent logic
- **Not Wired** = hardcoded mock data, no-op buttons, or UI-only with no backend

---

## 1. Core Contact Data — Mostly Wired

API: `contact.getById` returns contact with
`include: { owner, activities, notes, opportunities, aiInsight }`

| Field               | Status              | Notes                                                                                                           |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Name (first + last) | Wired               | From `apiContact.firstName` / `apiContact.lastName`                                                             |
| Email               | Wired               | From `apiContact.email`, rendered as `mailto:` anchor                                                           |
| Phone               | Wired               | From `apiContact.phone`, rendered as `tel:` anchor. Empty phone renders `<a href="tel:">` — clickable but no-op |
| Company             | Wired               | From `apiContact.company`                                                                                       |
| Title (job)         | Wired               | From `apiContact.title`                                                                                         |
| Status              | Wired               | From `apiContact.status`, rendered via `ContactStatusBadge`                                                     |
| Score               | Wired               | From `apiContact.score`                                                                                         |
| Avatar              | **Partially Wired** | Uses `normalizeAvatarSource()` but falls back to hardcoded Unsplash stranger photo (line 128-129)               |
| Owner Name          | Wired               | From `apiContact.owner.name`                                                                                    |
| Owner Title         | **Not Wired**       | Hardcoded `'Account Executive'` (line 392). Should map from `owner.role`.                                       |
| Owner Avatar        | **Not Wired**       | Falls back to hardcoded Unsplash URL (line 130-131)                                                             |
| Location            | **Not Wired**       | Always `''` (line 374) — comment `// Not in API yet`                                                            |
| Timezone            | **Not Wired**       | Always `''` (line 375) — comment `// Not in API yet`                                                            |
| Tags                | **Partially Wired** | Always `[]` (line 416) — comment `// Not in API yet`                                                            |
| isOnline            | **Not Wired**       | Always `false` (line 377) — no presence system                                                                  |
| isVIP               | **Not Wired**       | Always `false` (line 378) — not in API                                                                          |
| Last Contacted      | Wired               | From `apiContact.lastContactedAt`                                                                               |
| Created At          | Wired               | From `apiContact.createdAt`                                                                                     |

### Metrics Grid (Profile Card)

| Metric        | Status           | Notes                                                                                                                                          |
| ------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Emails Sent   | Wired            | Count of EMAIL-type activities                                                                                                                 |
| Emails Opened | **Not Wired**    | Hardcoded `0` (line 413) — `// Not tracked in current schema`                                                                                  |
| Open Rate     | **CRITICAL BUG** | `Math.round((emailsOpened / emailsSent) * 100)` at line 1319. `emailsOpened=0`, `emailsSent` can be `0` → `0/0 = NaN` → renders `"NaN%"` in UI |

---

## 2. Activities / Timeline

| Feature                                        | Status              | Notes                                                                                     |
| ---------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| Activity list                                  | Wired               | From `apiContact.activities`, transformed via `useMemo`                                   |
| Activity type mapping                          | Wired               | `mapActivityType()` with `'note'` fallback for unknown types                              |
| Activity metadata                              | **Partially Wired** | Cast `act.metadata as Activity['metadata']` (line 430) — no runtime validation            |
| Reactions                                      | **Not Wired**       | Always `[]` (line 432) — interface supports them, transform discards                      |
| Comments                                       | **Not Wired**       | Always `[]` (line 433) — same pattern                                                     |
| Action buttons (Reply, React, Add Note, Share) | **Not Wired**       | Lines 1076-1099 — function receives `_activity` (unused), all 4 buttons have no `onClick` |
| "All Sources" unified view                     | Wired               | Uses `ActivityFeed` component (IFC-069)                                                   |

---

## 3. AI Insights

| Feature                     | Status              | Notes                                                                                       |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| Engagement score            | Wired               | From `apiContact.aiInsight.engagementScore`                                                 |
| Sentiment                   | Wired               | From `apiContact.aiInsight.sentiment`                                                       |
| Churn risk score            | Wired               | From `apiContact.aiInsight.churnRiskScore`                                                  |
| Next best action            | Wired               | From `apiContact.aiInsight.nextBestAction`                                                  |
| Recommendations             | Wired               | Cast `insight.recommendations as string[]` (line 506) — no validation                       |
| Confidence                  | **Partially Wired** | Hardcoded `0.85` for both churnRisk (line 549) and nextBestAction (line 607) — not from API |
| Quiet period alert          | **Partially Wired** | Always `null` (lines 493, 507) — never populated from API                                   |
| "Run AI Analysis" when null | **Not Wired**       | No amber banner or button when `aiInsight` is null — silent fallback to "Unknown" badges    |

---

## 4. Notes

| Feature           | Status        | Notes                                                                        |
| ----------------- | ------------- | ---------------------------------------------------------------------------- |
| Notes list        | Wired         | From `apiContact.notes` via `useMemo`                                        |
| Notes tab content | Wired         | Renders notes with formatting                                                |
| Add Note button   | **Not Wired** | Line 2007 (Notes tab header) and line 2214 (sidebar "+" icon) — no `onClick` |

---

## 5. Files / Documents

| Feature       | Status        | Notes                                                                                                                                   |
| ------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Documents tab | **Not Wired** | Fully hardcoded: "Enterprise License Proposal.pdf" (line 1971) and "SOC2 Compliance Report.pdf" (line 1987) — static data, not from API |
| Upload button | **Not Wired** | Line 1958 — no `onClick` handler                                                                                                        |
| Download icon | **Not Wired** | Line 1039 — inside `renderRichPreview`, no `onClick`                                                                                    |

---

## 6. Emails

| Feature       | Status        | Notes                                                                                           |
| ------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| Email button  | **Not Wired** | Line 1133 — header action bar, no `onClick`                                                     |
| Email compose | **Not Wired** | No `EmailCompose` integration. `EmailCompose.tsx` component exists from PG-141 but is not wired |

---

## 7. Tasks

| Feature          | Status | Notes                                     |
| ---------------- | ------ | ----------------------------------------- |
| Tasks tab        | Wired  | Delegates to `RelatedTasksCard` component |
| Task count badge | Wired  | From `apiContact.tasks.length`            |

---

## 8. Deals

| Feature             | Status        | Notes                           |
| ------------------- | ------------- | ------------------------------- |
| Deals tab           | Wired         | From `apiContact.opportunities` |
| Deal list rendering | Wired         | Shows deal name, stage, value   |
| Add Deal button     | **Not Wired** | Line 1872 — no `onClick`        |

---

## 9. Tickets

| Feature     | Status        | Notes                                                                                                                                                                                                                                                           |
| ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tickets tab | **Not Wired** | Fully hardcoded: "Integration API question", `TKT-1234 . Resolved . Medium Priority` (lines 1937-1942). Hardcoded timestamp `'2024-12-15T14:00:00Z'` (line 1946). Tab badge hardcoded to `0` (line 629). `ContactWithRelations` type has no `tickets` relation. |

---

## 10. Sidebar Widgets

| Feature           | Status        | Notes                                                      |
| ----------------- | ------------- | ---------------------------------------------------------- |
| Contact info card | Wired         | Email, phone, company, title                               |
| Notes card        | Wired         | Shows recent notes with truncation                         |
| Similar contacts  | **Not Wired** | No similar contacts section — needs pgvector API (IFC-218) |

---

## 11. Action Buttons — All Not Wired

All header/inline action buttons render visually but have no `onClick` handlers:

| Line             | Button                 | Context                                                       |
| ---------------- | ---------------------- | ------------------------------------------------------------- |
| 1133             | Email                  | Header action bar                                             |
| 1139             | Log Call               | Header action bar                                             |
| 1426             | Log Activity           | Activity composer submit — textarea works but submit is no-op |
| 1410, 1415, 1420 | Attachment, Bold, List | Note composer toolbar                                         |
| 1341             | View Map               | Map placeholder                                               |
| 969              | Play Recording         | Call activity rich preview                                    |

**Total: 18 buttons** without `onClick` handlers (including 4 activity action
buttons and 3 toolbar buttons).

---

## 12. Map / Location

| Feature     | Status        | Notes                                                                                                                                                                    |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Map preview | **Not Wired** | Gradient placeholder with pin icon (lines 1331-1346). "View Map" button has no `onClick` (line 1341). `contact.location` always empty string. No map library integrated. |

---

## 13. Owner Management

| Feature            | Status        | Notes                                                          |
| ------------------ | ------------- | -------------------------------------------------------------- |
| Owner reassignment | **Not Wired** | Owner card is read-only. No reassignment UI for MANAGER/ADMIN. |

---

## 14. Loading / Error States

| Condition                            | Lines   | Status                                                                      |
| ------------------------------------ | ------- | --------------------------------------------------------------------------- |
| Loading (API in flight)              | 665-682 | Wired — skeleton grid                                                       |
| Auth error                           | 685-696 | Wired — redirect to `/login`                                                |
| Contact not found / server error     | 699-721 | Wired — "Contact Not Found" card                                            |
| Auth loading (query not yet enabled) | —       | **Gap** — falls through to "Contact Not Found" briefly before auth resolves |

---

## 15. Backend Security Issues

### CRITICAL

| #    | Issue                                                                 | Location                            | Details                                                                                                                                                                                                                                                                                                                                                           |
| ---- | --------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | `prismaWithTenant` is raw `ctx.prisma` — RLS never applied            | `trpc.ts` line 225                  | `tenantMiddleware` sets `prismaWithTenant: ctx.prisma` (raw client). `createTenantScopedPrisma()` exists in `tenant-context.ts:92-120` but is **never called**. The correct `tenantContextMiddleware()` at `tenant-context.ts:147-202` calls it but is not used. `tenantProcedure` uses the broken inline middleware. **Affects ALL routers, not just contacts.** |
| R-02 | `search` procedure has no tenant filter                               | `contact.router.ts` lines 566-604   | WHERE clause has only `OR: [email, firstName, lastName]` — no `createTenantWhereClause()`. `list` procedure correctly uses it at line 333. A SALES_REP can search across all tenants' contacts by name or email.                                                                                                                                                  |
| R-03 | `logActivity` transaction uses raw `ctx.prisma`, no tenantId in WHERE | `contact.router.ts` lines 1075-1101 | Transaction at line 1075 uses `ctx.prisma` directly. The `contact.update` at line 1092 has `where: { id: input.contactId }` with no `tenantId` guard. An authenticated user from Tenant A can update Tenant B's contact `lastContactedAt`.                                                                                                                        |

### HIGH

| #    | Issue                                                            | Location                            | Details                                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-04 | `bulkEmail` / `bulkExport` no tenant filter                      | `contact.router.ts` lines 711-748   | `where: { id: { in: ids } }` — no `createTenantWhereClause`. Data exfiltration path: submit guessed UUIDs, receive email addresses.                                                                                             |
| R-05 | `stats` ignores tenant context                                   | `contact.router.ts` lines 540-551   | Computes `typedCtx` but never uses it. Calls `contactService.getContactStatistics(ctx.user?.userId)` which queries by `ownerId` only — no tenantId boundary.                                                                    |
| R-06 | `getById` / `getByEmail` double-fetch with no tenant cross-check | `contact.router.ts` lines 163-278   | Service call through domain repo (unscoped singleton `apiPrisma`). Second Prisma query also unscoped. If contact exists in any tenant, both checks pass.                                                                        |
| R-07 | Zero audit logging in contact router                             | All 14 procedures                   | No calls to `ctx.security?.auditLogger` or `ctx.security?.auditEventHandler`. `auditLogger` exists in container (`container.ts:184-200`) and context (`context.ts:76`). Contact CRUD produces no audit trail. Violates IFC-098. |
| R-08 | All repositories use bare `apiPrisma` singleton                  | `container.ts` lines 88-91, 219-224 | Repositories created once at startup with no per-request tenant scoping. Service-layer is completely untenanted.                                                                                                                |

### MEDIUM

| #    | Issue                                                         | Location                                      | Details                                                                                             |
| ---- | ------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| R-09 | Raw SQL in `getTimeline` — no tenant filter, errors swallowed | `contact.router.ts` lines 953-966             | `$queryRaw` on `notes` table with only `contactId`. `.catch(() => [])` swallows all DB errors.      |
| R-10 | `sortBy` accepts arbitrary strings                            | `contact.router.ts` `list` procedure          | `sortBy` from `paginationSchema` has no enum whitelist. Arbitrary column names passed to `orderBy`. |
| R-11 | `getTimeline` broken nested `$queryRaw`                       | `contact.router.ts` lines 953-966             | Raw SQL queries on `notes` and `contact_activities` tables — no parameterized tenant filter.        |
| R-12 | `filterOptions` ignores status input                          | `contact.router.ts` `filterOptions` procedure | Returns all distinct statuses regardless of input filter params.                                    |

### LOW

| #    | Issue                                                                | Location                        | Details                                                                                            |
| ---- | -------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| R-13 | `recordInteraction` emits event with backward timestamp              | `Contact.ts` lines 533-548      | Under clock skew, event is emitted with `now < lastContactedAt` — confuses chronological ordering. |
| R-14 | `phone` in response schema is non-nullable but mapper returns `null` | `validators/contact.ts` line 81 | Would break if output validation were enabled. Currently silent.                                   |

---

## 16. Frontend UX Issues

### CRITICAL

| #    | Issue                                  | Location                                  | Details                                                                                                                                                                                                             |
| ---- | -------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | NaN% division by zero in Open Rate     | `contacts/[id]/page.tsx` line 1319        | `Math.round((emailsOpened / emailsSent) * 100)`. `emailsOpened=0` (hardcoded), `emailsSent` can be `0` → `0/0 = NaN` → renders `"NaN%"`. Guaranteed NaN for contacts with zero email activities.                    |
| F-02 | Tickets tab fully hardcoded            | `contacts/[id]/page.tsx` lines 1937-1946  | One hardcoded ticket: "Integration API question", `TKT-1234`. Static timestamp `'2024-12-15T14:00:00Z'`. Tab badge hardcoded to `0` (line 629). `ContactWithRelations` has no `tickets` relation.                   |
| F-03 | Documents tab fully hardcoded          | `contacts/[id]/page.tsx` lines 1971-1990  | Two hardcoded PDFs: "Enterprise License Proposal.pdf", "SOC2 Compliance Report.pdf". `apiContact.documents` exists in interface (lines 203-208) but is completely ignored.                                          |
| F-04 | Email / Log Call buttons — no onClick  | `contacts/[id]/page.tsx` lines 1133, 1139 | Header action bar buttons render but do nothing when clicked.                                                                                                                                                       |
| F-05 | 12+ action buttons have no onClick     | Various lines                             | Add Deal (1872), Create Ticket (1917), Add Note (2007, 2214), Upload (1958), View Map (1341), Play Recording (969), Attachment/Bold/List toolbar (1410/1415/1420), Log Activity submit (1426).                      |
| F-06 | Log Activity submit button is no-op    | `contacts/[id]/page.tsx` line 1426        | Textarea binds to `activityNote` state and accepts typing, but the "Log Activity" submit button has no `onClick` and no form submit. State is never sent to API. No `useMutation` calls exist anywhere on the page. |
| F-07 | Create contact page missing auth guard | `contacts/(list)/new/page.tsx`            | No `useRequireAuth()` hook call. Page can be accessed by unauthenticated users. Detail page (`[id]/page.tsx`) and edit page both have auth guards.                                                                  |

### HIGH

| #    | Issue                                         | Location                                           | Details                                                                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-08 | Status enum truncated in list/card components | `ContactList.tsx` line 9, `ContactCard.tsx` line 7 | Both define `'ACTIVE' \| 'INACTIVE' \| 'ARCHIVED'`. Create form defines wider set: `'ACTIVE' \| 'INACTIVE' \| 'PROSPECT' \| 'CUSTOMER' \| 'FORMER_CUSTOMER'`. Card fallback silently defaults to `ACTIVE` styling. Detail page has full 6-value enum with no fallback — unknown status crashes. |
| F-09 | Unsplash stranger photos as default avatars   | `contacts/[id]/page.tsx` lines 128-131             | `defaultContactAvatar` and `defaultOwnerAvatar` point to real people's Unsplash photos. Should use initials-based generated avatar.                                                                                                                                                             |
| F-10 | Location/timezone always empty                | `contacts/[id]/page.tsx` lines 374-375             | Both hardcoded `''` with `// Not in API yet` comment. UI renders empty strings.                                                                                                                                                                                                                 |
| F-11 | isOnline/isVIP always false — dead UI         | `contacts/[id]/page.tsx` lines 377-378             | `isOnline: false`, `isVIP: false` — badges/indicators reference these but never show.                                                                                                                                                                                                           |
| F-12 | Tags always empty array                       | `contacts/[id]/page.tsx` line 416                  | `tags: []` with `// Not in API yet`. Tags section renders empty.                                                                                                                                                                                                                                |
| F-13 | Edit page `as any` cast                       | `contacts/[id]/edit/page.tsx` line 146             | `payload as any` bypasses TypeScript validation on mutation call.                                                                                                                                                                                                                               |
| F-14 | `ContactDetail.tsx` component unused          | `components/contacts/ContactDetail.tsx`            | 597-line component with full test coverage but never imported by the actual page (which has inline implementation).                                                                                                                                                                             |
| F-15 | Sidebar saved views not consumed              | Sidebar config                                     | URL params (`?view=my`, `?view=starred`) not consumed by contacts list page. No saved views, column picker, or persistent filters.                                                                                                                                                              |

### MEDIUM

| #    | Issue                                            | Location                                | Details                                                                                                  |
| ---- | ------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| F-16 | Owner title hardcoded `'Account Executive'`      | `contacts/[id]/page.tsx` line 392       | Should map from `apiContact.owner.role` like lead detail does.                                           |
| F-17 | Confidence hardcoded 0.85                        | `contacts/[id]/page.tsx` lines 549, 607 | Both churnRisk and nextBestAction confidence set to `0.85` regardless of API data.                       |
| F-18 | Sentiment trend case mismatch risk               | `contacts/[id]/page.tsx`                | Sentiment values from API may use different casing than UI expects (e.g., `'Positive'` vs `'POSITIVE'`). |
| F-19 | Activity reactions/comments always empty         | `contacts/[id]/page.tsx` lines 432-433  | `reactions: []`, `comments: []` — Activity interface supports them but transform discards.               |
| F-20 | `emailsOpened` always 0                          | `contacts/[id]/page.tsx` line 413       | `// Not tracked in current schema`. Even when email tracking exists, this field won't update.            |
| F-21 | Hardcoded ticket timestamp                       | `contacts/[id]/page.tsx` line 1946      | Static `'2024-12-15T14:00:00Z'` in `formatRelativeTime()`.                                               |
| F-22 | `quietPeriodAlert` always null                   | `contacts/[id]/page.tsx` lines 493, 507 | Never populated from API, even when insight data exists.                                                 |
| F-23 | No `useMutation` calls on entire page            | `contacts/[id]/page.tsx`                | Zero mutations — only 1 `useQuery`. None of the create/edit/log actions are wired.                       |
| F-24 | `ContactForm` duplicated between create and edit | Create vs edit pages                    | Different form implementations, no shared component extraction.                                          |
| F-25 | `revalidateTag` with invalid argument            | Various contact pages                   | Called with arguments that don't match server-side cache tag patterns.                                   |

### LOW

| #    | Issue                                                 | Location                                 | Details                                                                                                                           |
| ---- | ----------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| F-26 | Status naming overlap between tabs and contact status | Tab names vs status values               | `'active'` used both as tab ID and contact status (different casing).                                                             |
| F-27 | `_tasks` unused memo variable                         | `contacts/[id]/page.tsx`                 | Underscore prefix signals intentional non-use.                                                                                    |
| F-28 | `ContactCard.tsx` unused by page                      | `components/contacts/ContactCard.tsx`    | List page uses inline card rendering, not the dedicated component.                                                                |
| F-29 | Empty phone renders clickable `tel:` link             | `contacts/[id]/page.tsx` lines 1281-1285 | `<a href="tel:">` — clickable but no-op anchor.                                                                                   |
| F-30 | Type casts without runtime validation                 | Lines 341, 425, 430, 506                 | 4 `as` casts suppress type errors; no Zod runtime validation. API returning unexpected data could cause silent failures.          |
| F-31 | Auth loading race condition                           | Loading states                           | Brief "Contact Not Found" flash before auth resolves — query disabled while `authLoading` is true, falls through to error branch. |

---

## 17. Integration & Workflow Gaps

### CRITICAL

| #    | Issue                                                          | Location                                               | Details                                                                                                                                                                                                                                                                                                               |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W-01 | `InMemoryEventBus` — events lost on restart                    | `apps/api/src/container.ts`                            | Contact domain events published to `InMemoryEventBus`. On server restart, all unprocessed events lost. `OutboxEventBusAdapter` exists but is unused. No event replay.                                                                                                                                                 |
| W-02 | Zero contact event handlers in events worker                   | `apps/workers/events-worker/src/main.ts` lines 250-468 | `registerEventHandlers()` has handlers for lead, opportunity, notification, and AI events — but zero for `CONTACT_CREATED` or `CONTACT_UPDATED`. These event types are defined in `DOMAIN_EVENT_TYPES` but no handler is registered.                                                                                  |
| W-03 | `mergeContacts` deletes secondary without re-parenting records | `ContactService.ts` lines 451-525                      | Merge takes activities, notes, etc. from secondary to primary but does not re-parent all child records (e.g., opportunities, tasks). Then secondary is deleted via `contactRepository.delete()` — orphaning any un-re-parented records. Also publishes no `ContactDeletedEvent` (event type doesn't exist in domain). |

### HIGH

| #    | Issue                                                   | Location                                      | Details                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W-04 | 6/8 contact event types missing from DOMAIN_EVENT_TYPES | `event-dispatcher.ts` lines 233-264           | Only `contact.created` and `contact.updated` defined. Missing: `contact.deleted`, `contact.account_associated`, `contact.account_disassociated`, `contact.converted_from_lead`, `contact.linked_to_lead`, `contact.interacted`. Domain emits all 8 but worker only knows 2. |
| W-05 | No webhook routing for contact events                   | `webhooks/handler.ts`                         | Webhook infrastructure exists but no contact-specific event handlers. External systems cannot subscribe to contact create/update/delete events.                                                                                                                             |
| W-06 | No email-to-contact matching                            | `modules/email/inbound.router.ts`             | Inbound email parsing creates email records but has no contact matching by sender address. Contact detail email tab shows activities filtered for type `'email'` — not real email integration.                                                                              |
| W-07 | No automated AI insight triggering for contacts         | AI worker                                     | Contact create/update doesn't trigger AI scoring. Lead has `scoreWithAI` procedure but Contact has no equivalent. AI insights only exist if manually seeded.                                                                                                                |
| W-08 | No bulk import for contacts                             | N/A                                           | No CSV upload or bulk create functionality. Common CRM feature missing.                                                                                                                                                                                                     |
| W-09 | Duplicate detection exists but unexposed                | `ContactService.ts` `findPotentialDuplicates` | Method exists in service but no tRPC procedure exposes it. No UI for merge/deduplicate workflow.                                                                                                                                                                            |
| W-10 | `mergeContacts` unexposed — no tRPC procedure           | `ContactService.ts` `mergeContacts`           | Full merge logic exists but no router procedure wraps it. Cannot be triggered from any UI.                                                                                                                                                                                  |

### MEDIUM

| #    | Issue                                                            | Location                          | Details                                                                                                                                                                                                             |
| ---- | ---------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W-11 | No notifications for contact events                              | `modules/notifications/`          | No notification handlers for any contact events. Contact CRUD is completely silent to users.                                                                                                                        |
| W-12 | `mergeContacts` no cross-tenant check                            | `ContactService.ts` lines 466-476 | Loads primary and secondary by ID with no tenant check. An attacker with two contact IDs (one per tenant) could merge cross-tenant. `linkToLead` at line 319 correctly checks `contact.tenantId !== lead.tenantId`. |
| W-13 | `associateWithAccount` inside `mergeContacts` causes double-save | `ContactService.ts` lines 502-504 | Saves primary once inside `associateWithAccount`, then again at line 509. Potential double event emission.                                                                                                          |
| W-14 | No contact routing rules                                         | `modules/routing/`                | Lead routing exists but no automatic contact assignment/routing based on territory, round-robin, or skills.                                                                                                         |

### LOW

| #    | Issue                                                      | Location                          | Details                                                                                                 |
| ---- | ---------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| W-15 | `listContacts` service returns empty as default            | `ContactService.ts` lines 581-591 | If neither `ownerId` nor `accountId` provided, returns `[]`. Router bypasses this (uses direct Prisma). |
| W-16 | `getContactStatistics` returns empty for undefined ownerId | `ContactService.ts` line 637      | `ownerId ? findByOwnerId(ownerId) : []` — stats are all zeros when no ownerId.                          |

---

## 18. Domain & Validation Issues

### HIGH

| #    | Issue                                                       | Location                          | Details                                                                                                                                                                 |
| ---- | ----------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | `reconstitute()` silently substitutes `unknown@unknown.com` | `Contact.ts` lines 314-319        | If persisted email fails `Email.create()` validation, silently substitutes fake email. No error raised. Could corrupt uniqueness checks. Should `Result.fail` or throw. |
| D-02 | `mergeContacts` no tenant isolation check                   | `ContactService.ts` lines 451-525 | Loads both contacts by ID without verifying same tenant. `linkToLead` correctly checks tenantId — inconsistent.                                                         |

### MEDIUM

| #    | Issue                                                                 | Location                               | Details                                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-03 | `contactListResponseSchema` key mismatch: `data` vs `contacts`        | `validators/contact.ts` line 105       | Schema expects `data` key but router returns `contacts` key. No `.output()` validation on procedure, so mismatch is silent. Frontend typed client receives `contacts` (not `data`).                                                                                                 |
| D-04 | No `ContactDeletedEvent` in domain                                    | `ContactEvents.ts`                     | 8 event types defined but no delete event. `deleteContact` service method publishes no events. Audit handler has `ContactDeleted` mapped (line 149 of `audit-event-handler.ts`) but event is never emitted.                                                                         |
| D-05 | No `ContactEmailChangedEvent`                                         | `ContactEvents.ts`                     | `updateEmail` emits generic `ContactUpdatedEvent` with `['email']` in `updatedFields`. Old email not captured. Downstream dedup/notification can't know what changed.                                                                                                               |
| D-06 | Audit event handler uses PascalCase keys but domain uses dot-notation | `audit-event-handler.ts` lines 130-153 | Handler maps `ContactCreated`, `ContactUpdated`, `ContactDeleted` (PascalCase). Domain events use `contact.created`, `contact.updated` (dot-notation). 5 contact event types unmapped (account_associated, account_disassociated, converted_from_lead, linked_to_lead, interacted). |

### LOW

| #    | Issue                                                             | Location                        | Details                                                                                                                                                   |
| ---- | ----------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-07 | `tags` update always emits event (no deep equality)               | `Contact.ts` lines 413-422      | Uses reference comparison `!== undefined` not deep equality. Every `updateContactInfo` with `tags` emits `ContactUpdatedEvent` even if content unchanged. |
| D-08 | `phone` non-nullable in response schema but mapper returns `null` | `validators/contact.ts` line 81 | `phoneSchema` doesn't accept `null`. Mapper returns `null` for missing phone. Would break if output validation enabled.                                   |

---

## 19. Test Coverage Gaps

| #    | Gap                                                | Location                       | Impact                                                                                                             |
| ---- | -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| T-01 | Contact detail page (2242 lines) — ZERO page tests | `contacts/[id]/page.tsx`       | Largest contact component has no page-level tests. All wiring gaps are untested.                                   |
| T-02 | Contact list page — ZERO page tests                | `contacts/(list)/page.tsx`     | List page with filtering, sorting, bulk operations — untested at page level.                                       |
| T-03 | Contact create page — ZERO page tests              | `contacts/(list)/new/page.tsx` | Form with status selection, validation — untested. Auth guard gap (F-07) would be caught.                          |
| T-04 | Tenant isolation NEVER tested in router tests      | All 3 test files               | 2,878 lines of router tests but none verify tenant boundaries. No cross-tenant access attempt tests.               |
| T-05 | Bulk selection untested in component tests         | `ContactList.test.tsx`         | Bulk select, bulk email, bulk export UI — untested.                                                                |
| T-06 | `logActivity` missing activity type coverage       | Router tests                   | Tests don't cover all activity types (email, call, meeting, note, task, etc.).                                     |
| T-07 | `getById` relations not asserted in tests          | Router tests                   | Tests check return value exists but don't assert included relations (activities, notes, opportunities, aiInsight). |
| T-08 | Tab content not verified in component tests        | `ContactDetail.test.tsx`       | Tests render component but don't verify individual tab content rendering.                                          |
| T-09 | Contract tests missing for bulk operations         | Contract tests                 | No contract tests for `bulkEmail`, `bulkExport`, `bulkDelete` procedures.                                          |
| T-10 | No E2E tests for contact CRUD                      | `tests/e2e/`                   | No Playwright tests for create -> view -> edit -> delete contact flow.                                             |

### Existing Test Coverage (for reference)

Contact has better router test coverage than Lead:

| File                                | Lines     | Notes                             |
| ----------------------------------- | --------- | --------------------------------- |
| `contact.router.test.ts`            | 1,087     | Core CRUD tests                   |
| `contact.router.additional.test.ts` | 1,225     | Edge cases                        |
| `contact.router.coverage.test.ts`   | 566       | Coverage-specific                 |
| `ContactList.test.tsx`              | 539       | List component                    |
| `ContactCard.test.tsx`              | 287       | Card component                    |
| `ContactForm.test.tsx`              | 679       | Form component                    |
| `ContactDetail.test.tsx`            | 597       | Detail component (unused by page) |
| `ActivityTimeline.test.tsx`         | 425       | Timeline component                |
| `RelationshipGraph.test.tsx`        | 403       | Graph component                   |
| **Total**                           | **5,808** | 9 test files                      |

---

## 20. Priority Fixes (Master List)

### CRITICAL (runtime crashes, security, data integrity)

| #   | Ref  | Issue                                                                    | Task                                   |
| --- | ---- | ------------------------------------------------------------------------ | -------------------------------------- |
| 1   | R-01 | `prismaWithTenant` is raw `ctx.prisma` — RLS never applied (ALL routers) | **IFC-237** (cross-cutting, Sprint 16) |
| 2   | R-02 | `search` procedure cross-tenant data leak                                | **IFC-252** (Sprint 16)                |
| 3   | R-03 | `logActivity` transaction tenant bypass                                  | **IFC-252** (Sprint 16)                |
| 4   | F-01 | NaN% division by zero in Open Rate                                       | **IFC-253** (Sprint 16)                |
| 5   | F-02 | Tickets tab fully hardcoded                                              | **IFC-256** (Sprint 18)                |
| 6   | F-03 | Documents tab fully hardcoded                                            | **IFC-256** (Sprint 18)                |
| 7   | F-04 | Email / Log Call buttons no-op                                           | **IFC-257** (Sprint 18)                |
| 8   | F-05 | 12+ action buttons no-op                                                 | **IFC-257** (Sprint 18)                |
| 9   | F-06 | Log Activity submit is no-op                                             | **IFC-257** (Sprint 18)                |
| 10  | F-07 | Create page missing auth guard                                           | **IFC-253** (Sprint 16)                |
| 11  | W-01 | `InMemoryEventBus` — events lost on restart                              | **IFC-250** (shared, Sprint 22)        |
| 12  | W-02 | Zero contact event handlers in events worker                             | **IFC-261** (Sprint 22)                |
| 13  | W-03 | `mergeContacts` deletes without re-parenting — data loss                 | **IFC-262** (Sprint 22)                |

### HIGH (data integrity, fake data, security)

| #   | Ref  | Issue                                                      | Task                    |
| --- | ---- | ---------------------------------------------------------- | ----------------------- |
| 14  | R-04 | `bulkEmail`/`bulkExport` no tenant filter — exfiltration   | **IFC-252** (Sprint 16) |
| 15  | R-05 | `stats` ignores tenant context                             | **IFC-252** (Sprint 16) |
| 16  | R-06 | `getById`/`getByEmail` double-fetch, no tenant cross-check | **IFC-252** (Sprint 16) |
| 17  | R-07 | Zero audit logging (GDPR)                                  | **IFC-255** (Sprint 18) |
| 18  | R-08 | All repositories use bare `apiPrisma` singleton            | **IFC-252** (Sprint 16) |
| 19  | F-08 | Status enum truncated (3 vs 6 values) — crash risk         | **IFC-253** (Sprint 16) |
| 20  | F-09 | Unsplash stranger photos as avatars                        | **IFC-258** (Sprint 20) |
| 21  | F-10 | Location/timezone always empty                             | **IFC-259** (Sprint 20) |
| 22  | F-11 | isOnline/isVIP dead UI                                     | **IFC-259** (Sprint 20) |
| 23  | F-12 | Tags always empty                                          | **IFC-259** (Sprint 20) |
| 24  | F-13 | Edit page `as any` cast                                    | **IFC-258** (Sprint 20) |
| 25  | F-14 | `ContactDetail.tsx` component unused by page               | **IFC-259** (Sprint 20) |
| 26  | F-15 | Sidebar saved views not consumed                           | **IFC-259** (Sprint 20) |
| 27  | W-04 | 6/8 event types missing from DOMAIN_EVENT_TYPES            | **IFC-261** (Sprint 22) |
| 28  | W-05 | No webhook routing for contact events                      | **IFC-261** (Sprint 22) |
| 29  | W-06 | No email-to-contact matching                               | **IFC-263** (Sprint 22) |
| 30  | W-07 | No automated AI insight triggering                         | **IFC-263** (Sprint 22) |
| 31  | W-08 | No bulk import                                             | **IFC-264** (Sprint 24) |
| 32  | W-09 | Duplicate detection unexposed                              | **IFC-262** (Sprint 22) |
| 33  | W-10 | Merge unexposed — no tRPC procedure                        | **IFC-262** (Sprint 22) |
| 34  | D-01 | `reconstitute()` fake email fallback                       | **IFC-260** (Sprint 20) |
| 35  | D-02 | `mergeContacts` no tenant check                            | **IFC-260** (Sprint 20) |

### MEDIUM (UX, code quality)

| #   | Ref  | Issue                                           | Task                            |
| --- | ---- | ----------------------------------------------- | ------------------------------- |
| 36  | R-09 | Raw SQL `getTimeline` no tenant filter          | **IFC-254** (Sprint 16)         |
| 37  | R-10 | `sortBy` arbitrary strings                      | **IFC-254** (Sprint 16)         |
| 38  | R-11 | `getTimeline` broken nested `$queryRaw`         | **IFC-254** (Sprint 16)         |
| 39  | R-12 | `filterOptions` ignores status input            | **IFC-254** (Sprint 16)         |
| 40  | F-16 | Owner title hardcoded                           | **IFC-258** (Sprint 20)         |
| 41  | F-17 | Confidence hardcoded 0.85                       | **IFC-258** (Sprint 20)         |
| 42  | F-18 | Sentiment trend case mismatch                   | **IFC-258** (Sprint 20)         |
| 43  | F-19 | Activity reactions/comments always empty        | **IFC-219** (shared, Sprint 20) |
| 44  | F-20 | `emailsOpened` always 0                         | **IFC-259** (Sprint 20)         |
| 45  | F-21 | Hardcoded ticket timestamp                      | **IFC-256** (Sprint 18)         |
| 46  | F-22 | `quietPeriodAlert` always null                  | **IFC-258** (Sprint 20)         |
| 47  | F-23 | No `useMutation` calls on page                  | **IFC-257** (Sprint 18)         |
| 48  | F-24 | `ContactForm` duplicated                        | **IFC-258** (Sprint 20)         |
| 49  | F-25 | `revalidateTag` invalid argument                | **IFC-258** (Sprint 20)         |
| 50  | W-11 | No notifications for contact events             | **IFC-261** (Sprint 22)         |
| 51  | W-12 | `mergeContacts` cross-tenant risk               | **IFC-262** (Sprint 22)         |
| 52  | W-13 | Double-save in merge+associateWithAccount       | **IFC-262** (Sprint 22)         |
| 53  | W-14 | No contact routing rules                        | **IFC-263** (Sprint 22)         |
| 54  | D-03 | Schema key mismatch `data` vs `contacts`        | **IFC-254** (Sprint 16)         |
| 55  | D-04 | No `ContactDeletedEvent`                        | **IFC-260** (Sprint 20)         |
| 56  | D-05 | No `ContactEmailChangedEvent`                   | **IFC-260** (Sprint 20)         |
| 57  | D-06 | Audit event PascalCase vs dot-notation mismatch | **IFC-255** (Sprint 18)         |

### LOW (minor, enhancements)

| #   | Ref  | Issue                                        | Task                    |
| --- | ---- | -------------------------------------------- | ----------------------- |
| 58  | R-13 | `recordInteraction` backward timestamp event | **IFC-260** (Sprint 20) |
| 59  | R-14 | Phone non-nullable schema vs null mapper     | **IFC-254** (Sprint 16) |
| 60  | F-26 | Status naming overlap                        | **IFC-253** (Sprint 16) |
| 61  | F-27 | `_tasks` unused memo                         | **IFC-259** (Sprint 20) |
| 62  | F-28 | `ContactCard.tsx` unused                     | **IFC-259** (Sprint 20) |
| 63  | F-29 | Empty phone `tel:` link                      | **IFC-258** (Sprint 20) |
| 64  | F-30 | Type casts without runtime validation        | **IFC-258** (Sprint 20) |
| 65  | F-31 | Auth loading race condition                  | **IFC-253** (Sprint 16) |
| 66  | W-15 | `listContacts` returns empty default         | **IFC-264** (Sprint 24) |
| 67  | W-16 | Stats returns empty for undefined ownerId    | **IFC-264** (Sprint 24) |
| 68  | D-07 | Tags update always emits event               | **IFC-260** (Sprint 20) |
| 69  | D-08 | Phone schema nullable mismatch               | **IFC-254** (Sprint 16) |

### TEST COVERAGE GAPS

| #   | Ref  | Gap                                   | Task                    |
| --- | ---- | ------------------------------------- | ----------------------- |
| 70  | T-01 | Contact detail page — ZERO page tests | **IFC-265** (Sprint 18) |
| 71  | T-02 | Contact list page — ZERO page tests   | **IFC-266** (Sprint 18) |
| 72  | T-03 | Contact create page — ZERO page tests | **IFC-266** (Sprint 18) |
| 73  | T-04 | Tenant isolation NEVER tested         | **IFC-265** (Sprint 18) |
| 74  | T-05 | Bulk selection untested               | **IFC-266** (Sprint 18) |
| 75  | T-06 | `logActivity` missing type coverage   | **IFC-265** (Sprint 18) |
| 76  | T-07 | `getById` relations not asserted      | **IFC-265** (Sprint 18) |
| 77  | T-08 | Tab content not verified              | **IFC-265** (Sprint 18) |
| 78  | T-09 | Contract tests missing for bulk ops   | **IFC-266** (Sprint 18) |
| 79  | T-10 | No E2E tests                          | **IFC-266** (Sprint 18) |

---

## 21. Cross-Entity Overlap with Lead Audit

Several findings are shared with the lead domain audit
(`docs/audit/lead-detail-wiring-audit.md`). Shared remediation tasks should be
used where possible:

| Issue                                 | Lead Audit Ref | Contact Audit Ref  | Shared Task                         |
| ------------------------------------- | -------------- | ------------------ | ----------------------------------- |
| `prismaWithTenant` raw (ALL routers)  | S2             | R-01               | IFC-237 (or new cross-cutting task) |
| `InMemoryEventBus` events lost        | W3             | W-01               | IFC-250                             |
| Activity reactions/comments always [] | §2 Activities  | F-19               | IFC-219                             |
| Similar entity sidebar empty          | §10 Sidebar    | —                  | IFC-218                             |
| Email compose not wired               | §6 Emails      | F-04               | IFC-217                             |
| File upload/download not wired        | §5 Files       | F-03, F-05         | IFC-216                             |
| AI insight null-state UX              | §3 AI          | (existing IFC-220) | IFC-220                             |
| `sortBy` arbitrary strings            | S7             | R-10               | IFC-239                             |

---

## 22. Changes Log

### 2026-03-05 — Initial Contact Domain Audit

**Scope**: All contact-related code across backend (router, domain, validators,
events, container, trpc), frontend (detail page, list page, create page, edit
page, components), AI worker, and integration points (email, timeline,
notifications, webhooks, events worker, merge, duplicate detection).

**Method**: 3 parallel Explore agents analyzed: (1) Contact detail page (2242
lines), (2) Contact backend (router, trpc, domain, validators, service,
container — 7 files), (3) Tests + integration points (9 test files, events
worker, audit handler, create/edit pages, list/card components).

**Findings**: 79 total issues:

- 13 CRITICAL (3 tenant isolation bypass, NaN%, 2 hardcoded tabs, 6+ no-op
  buttons, auth guard, events lost, no event handlers, merge data loss)
- 22 HIGH (data exfiltration, zero audit logging, unscoped repos, status enum
  crash, fake avatars, dead UI fields, missing integrations, domain issues)
- 22 MEDIUM (raw SQL, UX inconsistencies, missing events, code quality)
- 12 LOW (minor issues)
- 10 Test coverage gaps (3 pages with zero tests, tenant isolation untested,
  missing E2E)

**Tasks created** (15 new tasks, IFC-252 to IFC-266):

- IFC-252: Contact Router Security — Tenant Isolation Fixes (Sprint 16,
  CRITICAL) — R-02,R-03,R-04,R-05,R-06
- IFC-253: Contact Detail NaN Fix + Auth Guard + Status Enum (Sprint 16,
  CRITICAL) — F-01,F-07,F-08
- IFC-254: Contact Router Data Integrity Fixes (Sprint 16, HIGH) —
  R-09,R-10,R-12,D-03,D-08,R-14
- IFC-255: Contact Audit Logging (Sprint 18, HIGH) — R-07,D-06
- IFC-256: Contact Detail Hardcoded Tabs — Tickets & Documents (Sprint 18, HIGH)
  — F-02,F-03,F-21
- IFC-257: Contact Detail Action Button Wiring (Sprint 18, HIGH) —
  F-04,F-05,F-06,F-23
- IFC-258: Contact Frontend Consistency — Avatars, Owner, Confidence (Sprint 20,
  MEDIUM) — F-09,F-16,F-17,F-22,F-24
- IFC-259: Contact Dead UI Fields & Unused Components (Sprint 20, MEDIUM) —
  F-10,F-11,F-12,F-14,F-28,F-20
- IFC-260: Contact Domain Model Fixes (Sprint 20, HIGH) —
  D-01,D-02,D-04,D-05,D-07
- IFC-261: Contact Event Pipeline — Worker Handlers + Event Types (Sprint 22,
  MEDIUM) — W-02,W-04,W-05,W-11
- IFC-262: Contact Merge & Duplicate Detection Wiring (Sprint 22, HIGH) —
  W-03,W-09,W-10,W-12,W-13
- IFC-263: Contact Email & AI Integration (Sprint 22, MEDIUM) — W-06,W-07,W-14
- IFC-264: Contact Bulk Import & Service Layer Fixes (Sprint 24, LOW) —
  W-08,W-15,W-16
- IFC-265: Contact Detail Page Tests (Sprint 18, TEST) —
  T-01,T-04,T-06,T-07,T-08
- IFC-266: Contact List/Create Page Tests + E2E (Sprint 18, TEST) —
  T-02,T-03,T-05,T-09,T-10

**Shared tasks** (cross-entity overlap with lead audit):

- IFC-237: Tenant isolation (R-01 cross-cutting)
- IFC-250: InMemoryEventBus → Outbox (W-01)
- IFC-219: Activity reactions/comments (F-19)
- IFC-220: AI Insight Null-State UX for Contact (existing)
