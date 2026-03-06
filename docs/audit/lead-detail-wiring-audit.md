# Lead Detail (Lead 360) — Wiring Audit

**Page**: `apps/web/src/app/leads/[id]/page.tsx` (~2079 lines) **API**:
`apps/api/src/modules/lead/lead.router.ts` → `getById`, `addNote`, `logActivity`
procedures **Date**: 2026-03-03 (created), 2026-03-04 (wiring fix session),
2026-03-05 (second audit pass + comprehensive flow analysis — 48 additional
issues found)

---

## Summary

| Category              | Wired  | Partially Wired | Not Wired |
| --------------------- | ------ | --------------- | --------- |
| Core Lead Data        | 13     | 1               | 2         |
| Activities / Timeline | 4      | 2               | 2         |
| AI Insights           | 8      | 1               | 1         |
| Lead IQ Sidebar       | 4      | 0               | 2         |
| Notes                 | 3      | 0               | 0         |
| Files                 | 1      | 0               | 1         |
| Emails                | 0      | 1               | 1         |
| Tasks                 | 2      | 0               | 0         |
| Sidebar Widgets       | 3      | 0               | 1         |
| Action Buttons        | 3      | 1               | 2         |
| Map / Location        | 0      | 0               | 1         |
| Owner Management      | 0      | 0               | 1         |
| **Total**             | **41** | **6**           | **14**    |

### Comprehensive Flow Analysis (2026-03-05)

| Category               | CRITICAL | HIGH   | MEDIUM | LOW   | Test Gaps |
| ---------------------- | -------- | ------ | ------ | ----- | --------- |
| Backend Security       | 4        | 4      | 3      | 1     | 2         |
| Frontend Consistency   | 1        | 3      | 5      | 0     | 4         |
| Integration / Workflow | 0        | 4      | 3      | 4     | 0         |
| Domain / Validation    | 0        | 3      | 1      | 1     | 3         |
| **Total**              | **5**    | **14** | **12** | **6** | **9**     |

Previous (2026-03-03): 30 wired / 9 partial / 16 not wired. **Wiring fix session
(2026-03-04)**: 15 items fixed (12 not-wired → wired, 3 partial → wired).

Legend:

- **Wired** = fetches real data from API/DB, displays correctly
- **Partially Wired** = fetches some data but has hardcoded fallbacks, missing
  fields, or divergent logic
- **Not Wired** = hardcoded mock data, no-op buttons, or UI-only with no backend

---

## 1. Core Lead Data — Mostly Wired

API: `lead.getById` returns lead with
`include: { owner, activities, notes, files, aiInsight, tasks }`

| Field                   | Status                | Notes                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name (first + last)     | Wired                 | From `apiLead.firstName` / `apiLead.lastName`                                                                                                                                                                                                                                                |
| Email                   | Wired                 | From `apiLead.email`                                                                                                                                                                                                                                                                         |
| Phone                   | Wired                 | From `apiLead.phone`, transforms `PhoneNumber` value object                                                                                                                                                                                                                                  |
| Company                 | Wired                 | From `apiLead.company`                                                                                                                                                                                                                                                                       |
| Title (job)             | Wired                 | From `apiLead.title`                                                                                                                                                                                                                                                                         |
| Location                | Wired                 | From `apiLead.location`                                                                                                                                                                                                                                                                      |
| Website                 | Wired                 | From `apiLead.website`                                                                                                                                                                                                                                                                       |
| Status                  | Wired                 | From `apiLead.status`, rendered via `LeadStatusBadge`                                                                                                                                                                                                                                        |
| Source                  | Wired                 | From `apiLead.source`, rendered via `SourceBadge`                                                                                                                                                                                                                                            |
| Score                   | Wired                 | From `apiLead.score`                                                                                                                                                                                                                                                                         |
| Tags                    | Wired                 | From `apiLead.tags` (array)                                                                                                                                                                                                                                                                  |
| Avatar                  | Wired                 | From `apiLead.avatarUrl`, normalized via `normalizeAvatarSource()`                                                                                                                                                                                                                           |
| Owner Name              | Wired                 | From `apiLead.owner.name`                                                                                                                                                                                                                                                                    |
| Owner Title             | ~~Hardcoded~~ → Wired | ~~Always `'Sales Representative'` (line 408). Should use `apiLead.owner.role` or a role-to-title map~~ **Fixed 2026-03-04**: Mapped from `apiLead.owner.role` via role-to-title map (SALES_REP → "Sales Representative", MANAGER → "Manager", ADMIN → "Administrator", USER → "Team Member") |
| Temperature             | Wired                 | Derived from score via `getTemperature()` — not a DB field                                                                                                                                                                                                                                   |
| Estimated Value         | Wired                 | From `apiLead.estimatedValue`                                                                                                                                                                                                                                                                |
| Company link to Account | **Not Wired**         | Company name displayed as plain `<span>` in profile card (line 1352) and info panel (line 1656). No `<Link>` to `/accounts/{accountId}`. The lead transform has no `accountId` field, so there is no way to navigate to the Account page.                                                    |
| Location map            | **Not Wired**         | Location shown as text (line 1396). Map section (lines 1453-1465) is a gradient placeholder with non-functional "View Map" button (no `onClick` handler). No map library (Google Maps, Mapbox, etc.) integrated.                                                                             |
| Last Contacted          | Wired                 | From `apiLead.lastContactedAt`, falls back to `createdAt`                                                                                                                                                                                                                                    |
| Created At              | Wired                 | From `apiLead.createdAt`                                                                                                                                                                                                                                                                     |

### Metrics Grid (Profile Card)

| Metric      | Status              | Notes                                                                                                                                                                                            |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Est. Value  | Wired               | `leadMetrics.estimatedValue` from `lead.estimatedValue`                                                                                                                                          |
| Lead Score  | Wired               | `lead.score`                                                                                                                                                                                     |
| Open Rate   | **Partially Wired** | Calculated from activities of type `email` (lines 735-747). Not a real email tracking metric — just counts activities with `metadata.opened`. No integration with email service (Gmail/Outlook). |
| Touchpoints | Wired               | Count of activities (`leadMetrics.touchpoints`)                                                                                                                                                  |

---

## 2. Activities / Timeline

### Data Source

- API returns `activities` relation (LeadActivity model), ordered by
  `timestamp DESC`, limited to 50
- Seed data: ~~8 activities seeded across 2 leads (marcusReed, sarahMiller) via
  `seedLeadActivities()`~~ **Updated 2026-03-04**: ~35 activities seeded across
  all 14 leads (2-4 per lead)
- ~~**Most leads have 0 activities in seed data** — only Marcus Reed and Sarah
  Miller have seeded activities~~ **Fixed 2026-03-04**

### Activity Types Supported

`web_form`, `score_update`, `email`, `call`, `meeting`, `status_change`, `note`,
`qualification` — all mapped from `LeadActivityType` enum

| Feature                                          | Status                | Notes                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity list (timeline view)                    | Wired                 | Fetches from `apiLead.activities`, transforms to UI format                                                                                                                                                                                                                                                             |
| Activity type filtering                          | Wired                 | Client-side filter on `activityTypeFilter` state                                                                                                                                                                                                                                                                       |
| Activity search                                  | Wired                 | Client-side text search on title/description                                                                                                                                                                                                                                                                           |
| Rich previews (email, call, meeting, etc.)       | Wired                 | `renderRichPreview()` renders metadata per type                                                                                                                                                                                                                                                                        |
| Unified Activity Feed (IFC-069)                  | Wired                 | Toggle between "Timeline" and "All Sources" views. Uses `<ActivityFeed>` component with `useActivityFeed()` hook                                                                                                                                                                                                       |
| Person filter                                    | **Partially Wired**   | Dropdown exists but `personFilters` array only has `{ value: 'all', label: 'All People' }` — no actual per-person filtering                                                                                                                                                                                            |
| Activity reactions                               | **Not Wired**         | Always set to `[]` (line 431). UI renders reactions if present but data is never populated                                                                                                                                                                                                                             |
| Activity comments                                | **Not Wired**         | Always set to `[]` (line 432). UI renders comments if present but data is never populated                                                                                                                                                                                                                              |
| Activity actions (Reply, React, Add Note, Share) | **Not Wired**         | Buttons rendered in `renderActivityActions()` (lines 968-987) but all are no-ops — no `onClick` handlers                                                                                                                                                                                                               |
| Sentiment banner                                 | **Partially Wired**   | Shows `aiInsights.sentimentTrend` and `lastEngagementDays` from AI insight data, but only appears when insight exists                                                                                                                                                                                                  |
| Recent Activity (Overview tab)                   | **Not Wired**         | Shows "No activities yet" with no CTA to log one (line 1600). Only shows `activities.slice(0, 3)`. Unlike the full Activity tab (which has a note textarea), the Overview section has no "Log your first activity" prompt. Most leads will show empty here unless activities are explicitly seeded or logged.          |
| Log Activity input                               | ~~Not Wired~~ → Wired | ~~Textarea and "Log Activity" button exist (lines 1247-1268) but no submit handler — `activityNote` state is set but never sent to API~~ **Fixed 2026-03-04**: Submits via `lead.logActivity` mutation (creates LeadActivity + updates `lastContactedAt` in transaction). Invalidates `lead.getById` query on success. |

---

## 3. AI Insights Tab

### Data Source

- `apiLead.aiInsight` (LeadAIInsight model) — populated via:
  1. Seed data: `seedLeadAIInsights()` creates insights for all 14 leads with
     realistic data
  2. Runtime: `lead.scoreWithAI` mutation triggers fire-and-forget upsert via
     `deriveLeadInsights()`

### AI Insights Mapping (lines 489-533)

| Field                   | Status                | Notes                                                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversion Probability  | Wired                 | From `insight.conversionProbability` (seed: 15-92%)                                                                                                                                                                                                                                         |
| Estimated Value         | Wired                 | From `insight.estimatedValue` (seed: $15k-$92k)                                                                                                                                                                                                                                             |
| Churn Risk              | Wired                 | From `insight.churnRisk` enum (MINIMAL/LOW/MEDIUM/HIGH/CRITICAL)                                                                                                                                                                                                                            |
| Engagement Score        | Wired                 | From `insight.engagementScore` (seed: 50-95)                                                                                                                                                                                                                                                |
| Sentiment               | Wired                 | From `insight.sentiment` (POSITIVE/NEUTRAL/NEGATIVE)                                                                                                                                                                                                                                        |
| Sentiment Trend         | Wired                 | From `insight.sentimentTrend` (improving/stable/declining)                                                                                                                                                                                                                                  |
| Next Best Action (text) | Wired                 | From `insight.nextBestAction` — derived text recommendation                                                                                                                                                                                                                                 |
| Recommendations list    | Wired                 | From `insight.recommendations` (JSON array of strings)                                                                                                                                                                                                                                      |
| ICP Match               | Wired                 | From `insight.icpMatch` — was broken (missing DB column), now fixed                                                                                                                                                                                                                         |
| Last Engagement Days    | Wired                 | From `insight.lastEngagementDays`                                                                                                                                                                                                                                                           |
| Lead Score              | ~~Divergent~~ → Wired | ~~Uses `lead.score` (not `insight.engagementScore` or a separate qualification field). The label says "Qualification Score" but it's actually the lead's raw score.~~ **Fixed 2026-03-04**: Label renamed from "Qualification Score" to "Lead Score" to accurately reflect the data source. |

### Fallback When No AI Insight (lines 491-509)

When `apiLead.aiInsight` is `null`, all fields fall back to hardcoded defaults:

- `qualificationScore` → `lead.score || 0`
- `engagementLevel` → `'Unknown'`
- `engagementScore` → `0`
- `conversionProbability` → `0`
- `churnRisk` → `'Unknown'`
- `sentiment` → `'Unknown'`
- `nextBestAction` → `'Gather more information about this lead'`
- `recommendations` → `['No AI recommendations available yet']`
- `icpMatch` → `'Not analyzed yet'`

**Issue**: No UI indication that data is a fallback vs real AI analysis. Should
show "Run AI Analysis" button or "Pending" state.

**Issue (added 2026-03-05)**: The `engagementLevel: 'Unknown'` string renders
directly in the Lead IQ sidebar as a badge label (line 2258). Similarly
`churnRisk: 'Unknown'` and `sentiment: 'Unknown'` appear as raw text. These
should either show a styled "Not analyzed" state or trigger the "Run AI
Analysis" CTA rather than displaying "Unknown" as if it were a valid data value.

### ChurnRiskCard Component (lines 536-603)

| Feature                  | Status                | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Risk level visualization | Wired                 | Maps DB enum to component `ChurnRiskLevel` type                                                                                                                                                                                                                                                                                                                                          |
| Risk score               | **Derived**           | Not from DB — mapped from level (CRITICAL=90, HIGH=70, etc.)                                                                                                                                                                                                                                                                                                                             |
| Risk factors             | ~~Hardcoded~~ → Wired | ~~`factors` array (lines 578-593) is always the same 4 items regardless of actual lead data. Labels like "No recent engagement" are static, not computed from real activity data~~ **Fixed 2026-03-04**: Derived from lead data — activity recency from `lastEngagementDays`, engagement level from `engagementScore`, score trend from lead score, response pattern from activity count |
| Confidence               | ~~Hardcoded~~ → Wired | ~~Always `0.85` (line 571). Should come from AI model confidence~~ **Fixed 2026-03-04**: Derived from score distance to threshold boundaries: `Math.min(0.95, 0.5 + Math.abs(engagementScore - 50) / 100)`                                                                                                                                                                               |
| SLA hours                | Derived               | Mapped from risk level (CRITICAL=24h, HIGH=48h, etc.)                                                                                                                                                                                                                                                                                                                                    |

### NextBestActionCard Component (lines 605-666)

| Feature             | Status                | Notes                                                                                                                                                                                        |
| ------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action text         | Wired                 | From `insight.nextBestAction`                                                                                                                                                                |
| Rationale           | ~~Hardcoded~~ → Wired | ~~Always `'Based on engagement patterns and similar lead outcomes'` (line 640)~~ **Fixed 2026-03-04**: Derived from insight data (engagement score, sentiment trend, conversion probability) |
| Confidence          | ~~Hardcoded~~ → Wired | ~~Always `0.85` (line 639)~~ **Fixed 2026-03-04**: Derived from `engagementScore / 100`                                                                                                      |
| Alternative actions | ~~Hardcoded~~ → Wired | ~~Always same 2 alternatives (lines 642-660) regardless of lead data~~ **Fixed 2026-03-04**: First alternative from `insight.recommendations[0]`, second derived from insight data           |
| Impact              | **Partially Wired**   | ~~Always `'HIGH'` (line 641)~~ **Updated 2026-03-04**: Mapped from conversion probability thresholds (>70%=HIGH, >40%=MEDIUM, else LOW). Still somewhat coarse.                              |

---

## 4. Lead IQ Sidebar

| Feature                      | Status                | Notes                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead Score + progress bar    | ~~Divergent~~ → Wired | ~~Shows `lead.score` labeled as "Qualification Score" (line 1919). Not a separate AI-computed qualification metric. The score and the label don't match semantically.~~ **Fixed 2026-03-04**: Label renamed to "Lead Score"                                                                                                             |
| ICP Match text               | Wired                 | From `aiInsights.icpMatch` (e.g., "Strong Match", "Partial Match")                                                                                                                                                                                                                                                                      |
| Engagement level + bar chart | Wired                 | Derived from `insight.engagementScore` (High/Medium/Low)                                                                                                                                                                                                                                                                                |
| Next Best Actions buttons    | ~~Hardcoded~~ → Wired | ~~Always the same 2 actions (lines 526-529): "Schedule Discovery Call" and "Send Case Study" / "Send Follow-up Email". These never change based on the actual `nextBestAction` text from the AI insight.~~ **Fixed 2026-03-04**: Derived from `insight.nextBestAction` text (icon parsed from action keywords) and first recommendation |
| "View Full Analysis" link    | Wired                 | Switches to AI Insights tab                                                                                                                                                                                                                                                                                                             |
| BETA badge                   | Static                | Visual only                                                                                                                                                                                                                                                                                                                             |

---

## 5. Notes Tab

| Feature                 | Status                | Notes                                                                                                                                                                                                |
| ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notes list              | Wired                 | From `apiLead.notes` (LeadNote model). Shows content, author, createdAt                                                                                                                              |
| Notes in sidebar widget | Wired                 | Shows first 2 notes in right sidebar                                                                                                                                                                 |
| Add Note button         | ~~Not Wired~~ → Wired | ~~Button exists (line 1663, 2018) but no `onClick` handler — no create note API call~~ **Fixed 2026-03-04**: Calls `lead.addNote` mutation via prompt dialog. Invalidates `lead.getById` on success. |

### Seed Data

- Notes are seeded for leads (via `seedLeadNotes()`). Content, author,
  timestamps come from DB.
- **Updated 2026-03-04**: Notes now seeded for 6 leads (marcusReed +
  sarahMiller, davidChen, ninaPatel, elenaRodriguez, rachelGreen)

---

## 6. Files Tab

| Feature         | Status        | Notes                                                               |
| --------------- | ------------- | ------------------------------------------------------------------- |
| Files list      | Wired         | From `apiLead.files` (LeadFile model). Shows name, size, uploadedAt |
| Upload button   | **Not Wired** | Button exists (line 1744) but no handler                            |
| Download button | **Not Wired** | Button exists (line 1766) but no handler — no download URL          |

### Seed Data

- Files are seeded (via `seedLeadFiles()`). Name, size, uploadedAt come from DB.
- **Updated 2026-03-04**: Files now seeded for 5 leads (marcusReed +
  sarahMiller, davidChen, ninaPatel, elenaRodriguez)

---

## 7. Emails Tab

| Feature             | Status              | Notes                                                                                                                                                             |
| ------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email list          | **Partially Wired** | Derived from activities of type `email` (lines 476-486). NOT from a real email integration (Gmail/Outlook). Only shows emails that were logged as lead activities |
| Compose button      | **Not Wired**       | Button exists (line 1695) but no handler                                                                                                                          |
| Email open tracking | **Partially Wired** | Shows `metadata.opened` and `metadata.openCount` from activity metadata. Not real email tracking — just whatever was logged in the activity                       |

---

## 8. Tasks Tab

| Feature               | Status | Notes                                                                                              |
| --------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Tasks list (full tab) | Wired  | Uses `<RelatedTasksCard entityType="lead" entityId={leadId}>` component which queries its own data |
| Tasks sidebar widget  | Wired  | Same component in compact mode                                                                     |
| Overview tab tasks    | Wired  | Same component with `maxItems={2}`                                                                 |

---

## 9. Sidebar Widgets

| Feature         | Status                                      | Notes                                                                                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead Owner card | Wired                                       | Shows owner name + avatar from API. ~~Title is hardcoded (see above)~~ Title now derived from role (see §1)                                                                                                                                                                                                          |
| Tasks widget    | Wired                                       | `<RelatedTasksCard>` component                                                                                                                                                                                                                                                                                       |
| Upcoming Events | Wired                                       | `<UpcomingEventsCard>` component — queries appointments API for lead-related events                                                                                                                                                                                                                                  |
| Notes widget    | Wired                                       | Shows first 2 notes from API data                                                                                                                                                                                                                                                                                    |
| Similar Leads   | ~~Not Wired~~ → **Not Wired (empty state)** | ~~Uses `mockSimilarLeads` (line 217) — hardcoded array of 3 fake leads. No API endpoint for lead similarity/matching~~ **Fixed 2026-03-04**: Removed `mockSimilarLeads`, replaced with empty state ("No similar leads found — AI similarity matching coming soon"). Still needs vector similarity API for real data. |

### ~~mockSimilarLeads (line 217-241)~~ Removed 2026-03-04

Previously contained:

```
- "Robert Kim" at "TechVentures Inc." (score 82)
- "Maria Garcia" at "DataFlow Corp" (score 78)
- "Alex Turner" at "CloudSync Ltd" (score 71)
```

These were completely static, never changed, and linked to non-existent lead
IDs.

---

## 10. Action Buttons (Header)

| Button               | Status                              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit                 | Wired                               | Navigates to `/leads/${lead.id}/edit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Convert Lead         | ~~Not Wired~~ → **Partially Wired** | ~~Button exists but no `onClick` handler (line 1008-1011)~~ **Fixed 2026-03-04**: Calls `lead.convert` mutation with pending state, redirects to contacts on success. **Issue found 2026-03-05**: Button always visible regardless of lead status, but backend (`LeadService.convertLead` line 322) requires `status === 'QUALIFIED'` — non-qualified leads get a cryptic `BAD_REQUEST` error. Should: (1) disable/hide button for non-QUALIFIED leads, (2) show status requirement in UI, (3) pass `createAccount` option. Also missing pre-conversion confirmation dialog. |
| Log Call             | **Not Wired**                       | Button exists but no `onClick` handler (line 1019-1022)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Pin                  | Wired                               | `<PinButton>` component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| More Actions (sheet) | ~~Partially Wired~~ → Wired         | ~~Opens `EntityActionSheet` but Archive/Delete actions have empty `onClick: () => {}` (lines 1047-1049)~~ **Fixed 2026-03-04**: Delete opens AlertDialog confirmation → calls `lead.delete` mutation → redirects to /leads. Archive opens AlertDialog confirmation → calls `lead.update` with status LOST → redirects to /leads.                                                                                                                                                                                                                                             |

---

## 11. Error Handling

| Issue                  | Details                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Generic error page~~ | ~~Line 718: `if ((error && !isAuthError)                                                     |     | !lead)` shows "Lead Not Found" for ANY non-auth error, including 500s. Should differentiate between 404, 500, and permission errors~~ **Fixed 2026-03-04**: Now differentiates NOT_FOUND (shows "Lead Not Found" with back link), INTERNAL_SERVER_ERROR (shows "Something went wrong" with retry button), and other errors (shows error message). |
| ~~No retry mechanism~~ | ~~No "Retry" button on error state~~ **Fixed 2026-03-04**: Retry button added for 500 errors |
| No loading skeleton    | Uses basic `<p>Loading lead details...</p>` instead of skeleton UI                           |

---

## 12. Data Flow Divergences

### ~~Lead IQ "Qualification Score" vs Lead Score~~ Fixed 2026-03-04

~~The sidebar shows `lead.score` labeled as "Qualification Score" (line 1919)~~
~~The AI Insights tab also shows `aiInsights.qualificationScore` which is...
also `lead.score` (line 516)~~ ~~There is no separate "qualification score"
computed by AI. The label is misleading.~~ ~~**Recommendation**: Either rename
to "Lead Score" or compute a real qualification score from AI signals~~
**Resolution**: Renamed to "Lead Score" throughout.

### Estimated Value inconsistency

- Profile card: `lead.estimatedValue` (raw cents from DB)
- AI Insights tab: `insight.estimatedValue` (different value — seed uses
  `score * 100_000` or `estimatedValue * 100`)
- These can show different numbers for the same lead
- **Recommendation**: Use a single source of truth

### Engagement Score sourcing

- Lead IQ sidebar: `aiInsights.engagementScore` (from LeadAIInsight)
- Metrics grid: No engagement metric shown
- The engagement score is AI-derived (based on source, title, status, recency)
  and only updates when `scoreWithAI` is called

### ~~nextBestActions vs nextBestAction~~ Fixed 2026-03-04

~~`insight.nextBestAction` (singular) is a text string from AI (e.g., "Send a
tailored proposal...")~~ ~~`aiInsights.nextBestActions` (plural) is always a
hardcoded array of 2 button items~~ ~~The text recommendation and the action
buttons are completely disconnected~~ **Resolution**: Action buttons now derived
from `insight.nextBestAction` text and recommendations.

---

## 12b. Map / Location View (added 2026-03-05)

| Feature           | Status        | Notes                                                                                                                                                                                                                                                                  |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location text     | Wired         | From `apiLead.location`, displayed as plain text in profile card (line 1396)                                                                                                                                                                                           |
| Map visualization | **Not Wired** | Lines 1453-1465: Gradient placeholder `div` with a `location_on` icon and "View Map" button. No map library loaded (no Google Maps, Mapbox, or Leaflet). The button has no `onClick` handler. `lead.location` string is never geocoded or passed to any map component. |

---

## 12c. Owner Management (added 2026-03-05)

| Feature        | Status        | Notes                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner display  | Wired         | Shows owner name, avatar, and title (derived from role) in sidebar card (lines 1468-1487)                                                                                                                                                                                                              |
| Reassign owner | **Not Wired** | The owner card is fully read-only — no dropdown, user picker, or "Reassign" button. Users with MANAGER/ADMIN RBAC roles should be able to reassign lead ownership directly from the detail page without navigating to the edit form. No `lead.reassignOwner` mutation is called anywhere on this page. |

---

## 12d. Convert Lead UX Issues (added 2026-03-05)

The `lead.convert` mutation was wired 2026-03-04 but has significant UX
problems:

| Issue                          | Details                                                                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No status gate on button       | Button always visible at line 1169 regardless of lead status. Backend (`LeadService.convertLead` line 322) requires `status === 'QUALIFIED'`. Clicking on a NEW/CONTACTED/UNQUALIFIED lead produces a cryptic `BAD_REQUEST` toast. |
| No confirmation dialog         | Conversion is a destructive operation (changes lead status permanently) but fires immediately on click with no confirmation.                                                                                                       |
| Missing `createAccount` option | Frontend sends `{ leadId }` only. The `convertLeadSchema` accepts `createAccount` (boolean) and `accountName` (string) but neither is prompted. User has no option to create an Account during conversion.                         |
| No success details             | On success, redirects to `/contacts` list. Should show the created contact ID or navigate to the new contact detail page.                                                                                                          |

---

## 13. Missing API Endpoints / Features

| Feature                         | What's needed                                                                          | Status                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| ~~Create note~~                 | ~~`lead.createNote` mutation (model exists, no tRPC procedure)~~                       | **Done 2026-03-04**: `lead.addNote` mutation added           |
| ~~Create activity~~             | ~~`lead.createActivity` mutation for the "Log Activity" textarea~~                     | **Done 2026-03-04**: `lead.logActivity` mutation added       |
| Upload file                     | `lead.uploadFile` mutation + file storage integration                                  | Follow-up: **IFC-216** (Sprint 23)                           |
| Download file                   | File download URL generation (S3/Supabase storage)                                     | Follow-up: **IFC-216** (Sprint 23)                           |
| Similar leads                   | `lead.getSimilar` query (vector similarity on embeddings or attribute matching)        | Follow-up: **IFC-218** (Sprint 20)                           |
| ~~Convert lead (button)~~       | ~~Wire to existing `lead.convert` or `lead.convertToDeal` procedure~~                  | **Done 2026-03-04**: Wired to `lead.convert`                 |
| Email compose                   | Integration with email service (Gmail/Outlook adapter exists in `packages/adapters`)   | Follow-up: **IFC-217** (Sprint 22)                           |
| Activity reactions              | Schema + API for activity reactions                                                    | Follow-up: **IFC-219** (Sprint 20)                           |
| Activity comments               | Schema + API for activity comments                                                     | Follow-up: **IFC-219** (Sprint 20)                           |
| ~~Lead delete (action sheet)~~  | ~~Wire to existing `lead.delete` procedure~~                                           | **Done 2026-03-04**: AlertDialog + `lead.delete`             |
| ~~Lead archive (action sheet)~~ | ~~Wire to existing `lead.bulkArchive` with single ID~~                                 | **Done 2026-03-04**: AlertDialog + `lead.update` status LOST |
| Map view                        | Geocode `lead.location` string, render on Google Maps/Mapbox/Leaflet embed             | Not started — placeholder UI exists, no map library          |
| Company link                    | Link company name to Account detail page via `accountId` relation                      | Not started — `accountId` not in lead transform              |
| Reassign owner                  | User picker for MANAGER/ADMIN roles to reassign lead owner                             | Not started — owner card is read-only                        |
| Convert lead UX                 | Status gate on button, confirmation dialog, `createAccount` option, success navigation | Not started — button fires raw mutation                      |
| Recent Activity CTA             | "Log your first activity" prompt in Overview tab empty state                           | Not started — shows generic "No activities yet"              |
| Engagement null-state           | Replace "Unknown" badge labels with styled "Not analyzed" state or AI CTA              | Not started — raw "Unknown" string rendered                  |

---

## 14. Seed Data Coverage

| Relation          | Seeded? | Count                 | Notes                                                                                                                                             |
| ----------------- | ------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leads             | Yes     | 14                    | All with complete profile data                                                                                                                    |
| Lead Owner (User) | Yes     | Via lead.ownerId      | Now includes `role` in API select                                                                                                                 |
| LeadAIInsight     | Yes     | 14 (1 per lead)       | Full insights with realistic values                                                                                                               |
| LeadActivity      | Yes     | ~~8 total~~ ~35 total | ~~Only for marcusReed (4) and sarahMiller (4). **12 leads have zero activities**~~ **Fixed 2026-03-04**: 2-4 activities per lead for all 14 leads |
| LeadNote          | Yes     | ~~Varies~~ ~8 total   | ~~Seeded via `seedLeadNotes()`~~ **Updated 2026-03-04**: 6 leads now have notes (was 1)                                                           |
| LeadFile          | Yes     | ~~Varies~~ ~6 total   | ~~Seeded via `seedLeadFiles()`~~ **Updated 2026-03-04**: 5 leads now have files (was 1)                                                           |
| Tasks             | Yes     | Varies                | Via task seed data with lead relations                                                                                                            |

~~**Key gap**: Most leads show empty activity timelines because only 2/14 leads
have seeded activities.~~ **Resolved 2026-03-04**

---

## 15. Backend Security & Data Integrity Issues (added 2026-03-05 — comprehensive flow analysis)

### CRITICAL

| #   | Issue                                               | Location                         | Details                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `NEGOTIATING` status missing from detail page       | `leads/[id]/page.tsx` line 139   | `LeadStatus` type union omits `NEGOTIATING` which exists in Prisma `LeadStatusEnum`. If a lead has `NEGOTIATING` status, detail page will crash at runtime — no fallback rendering for unknown status values.                                                                                  |
| S2  | `scoreWithAI` fire-and-forget uses raw `ctx.prisma` | `lead.router.ts` lines 530-574   | The `deriveLeadInsights()` call runs `.then()` outside the request context. Uses `ctx.prisma` (raw client) instead of `prismaWithTenant`, bypassing tenant isolation. The fire-and-forget also means errors are silently swallowed — notification fallback code at lines 517-527 is dead code. |
| S3  | `logActivity` transaction uses raw `ctx.prisma`     | `lead.router.ts` lines 1042-1064 | The Prisma `$transaction` uses `ctx.prisma.$transaction` instead of `prismaWithTenant`. While `tenantProcedure` adds `tenantId` to the query via middleware, the raw `$transaction` API may bypass this depending on Prisma version.                                                           |
| S4  | `bulkUpdateStatus` bypasses domain validation       | `lead.router.ts` lines 868-916   | Direct Prisma `updateMany` with no domain `Lead.changeStatus()` call. Skips status transition rules (e.g., can set QUALIFIED without going through NEW → CONTACTED → QUALIFIED). No domain events published.                                                                                   |

### HIGH

| #   | Issue                                            | Location                                                              | Details                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S5  | `update` procedure silently drops `status` field | `lead.router.ts` lines 291-312                                        | Input schema includes `status` but it's destructured out (`const { id, ...data } = input`) and the spread `data` is passed to `prisma.lead.update`. However, `status` is never explicitly excluded — it may or may not be in the spread depending on Prisma's accepted fields. If it IS silently dropped, status changes via the edit form are lost. If it IS accepted, it bypasses `Lead.changeStatus()` domain validation. |
| S6  | Score tier thresholds inconsistent               | `lead.router.ts` stats vs `packages/domain/src/crm/lead/LeadScore.ts` | Domain `LeadScore` uses 80/50 thresholds for HOT/WARM/COLD tiers. But `lead.router.ts` stats query at line ~620 uses 70/40 thresholds. Dashboard metrics and domain logic disagree on what constitutes a "hot" lead.                                                                                                                                                                                                         |
| S7  | `sortBy` accepts arbitrary strings               | `packages/validators/src/lead.ts` line ~85                            | `sortBy: z.string().optional()` — no enum constraint. Allows SQL injection via Prisma orderBy if the value is passed through unsanitized. Should be `z.enum(['createdAt', 'updatedAt', 'score', 'firstName', 'lastName', 'company'])`.                                                                                                                                                                                       |
| S8  | No audit logging in lead router                  | `lead.router.ts` (all 20 procedures)                                  | None of the 20 lead procedures emit audit log entries. `SecurityAuditService` exists (`apps/api/src/security/audit/`) but is never called from the lead router. GDPR-relevant operations (delete, bulkDelete, convert, export) have no audit trail.                                                                                                                                                                          |

### MEDIUM

| #   | Issue                                                     | Location                                     | Details                                                                                                                                                                                                               |
| --- | --------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S9  | `getHotLeads` / `getReadyForQualification` tenant concern | `lead.router.ts` lines 645-662               | These queries pass `userId` (from session) as `ownerId` filter, but don't explicitly add `tenantId`. Relies on Prisma middleware for tenant isolation — fragile if middleware is misconfigured.                       |
| S10 | `scoreWithAI` notification fallbacks are dead code        | `lead.router.ts` lines 517-527               | Three notification variable assignments (`notification`, `notificationType`, `notificationMessage`) are set but never used — the fire-and-forget `.then()` doesn't reference them.                                    |
| S11 | `LeadRoutedEvent` defined but never published             | `packages/domain/src/crm/lead/LeadEvents.ts` | Event class exists in domain layer but no lead procedure or service ever calls `eventBus.publish(new LeadRoutedEvent(...))`. Lead routing functionality exists in `routing.router.ts` but doesn't publish this event. |

### LOW

| #   | Issue                            | Location                           | Details                                                                                                                                            |
| --- | -------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| S12 | Prisma schema backslash comments | `packages/db/prisma/schema.prisma` | Model comments use `\\` prefix (e.g., `\\ Lead management`) instead of `//`. These are technically valid but non-standard and may confuse tooling. |

---

## 16. Frontend Consistency Issues (added 2026-03-05 — comprehensive flow analysis)

### CRITICAL

| #   | Issue                         | Location                    | Details                                                                                                                                                                                                                    |
| --- | ----------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | No auth guard on `/leads/new` | `leads/(list)/new/page.tsx` | Missing `useRequireAuth()` hook call. The create lead page can be accessed by unauthenticated users. All other protected pages use this hook. The page also uses `trpc` import instead of the standard `api` import alias. |

### HIGH

| #   | Issue                                       | Location                                                         | Details                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2  | `ActiveLeadsWidget` fully hardcoded         | `components/dashboard/widgets/ActiveLeadsWidget.tsx` lines 15-17 | Shows static "1,240" active leads and "vs 1,100 last month" text. No API call — widget renders fake data on every dashboard load.                                                                                                                                    |
| F3  | BANT fields silently dropped in create form | `leads/(list)/new/page.tsx` lines 251-256                        | Budget, Authority, Need, Timeline fields are collected in the form but never sent to the API mutation. The `onSubmit` handler maps `annualRevenue` → `estimatedValue` (line 264, semantic mismatch) and drops BANT entirely. `sourceOther` (line 269) also not sent. |
| F4  | `annualRevenue` mapped to `estimatedValue`  | `leads/(list)/new/page.tsx` line 264                             | Semantic mismatch: "Annual Revenue" (company's yearly income) is stored as "Estimated Value" (deal potential). These are fundamentally different business metrics.                                                                                                   |

### MEDIUM

| #   | Issue                                              | Location                                      | Details                                                                                                                                                                                     |
| --- | -------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F5  | `window.prompt()` for notes                        | `leads/[id]/page.tsx` line 1951               | Uses `window.prompt("Enter your note:")` — blocks UI thread, no rich text, no cancel detection (empty string vs null), no multi-line support. Should use a modal dialog or inline textarea. |
| F6  | Two different `StatusBadge` implementations        | `leads/[id]/page.tsx` vs `components/shared/` | Lead detail has inline `LeadStatusBadge` with custom color mapping. Other pages use shared `StatusBadge` component. Different color schemes for same statuses.                              |
| F7  | Two different Toast patterns                       | Various lead pages                            | Some pages use `toast.success()` (sonner), others use `useToast()` hook (shadcn). Inconsistent toast styling and behavior across lead flows.                                                |
| F8  | `trpc` vs `api` import inconsistency               | `leads/(list)/new/page.tsx` vs other pages    | Create page imports `trpc` directly. All other pages use the `api` alias from `@/lib/trpc`. Two different import paths for the same client — confusion risk.                                |
| F9  | Edit form uses `as any` cast, no client validation | `leads/[id]/edit/page.tsx`                    | Mutation payload cast as `as any` to bypass TypeScript. No Zod schema validation on client before submit. Server errors are the only validation — poor UX (no inline field errors).         |

---

## 17. Integration & Workflow Gaps (added 2026-03-05 — comprehensive flow analysis)

### HIGH

| #   | Issue                                       | Location                                                     | Details                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | `LeadActivity` not in unified timeline      | `lead.router.ts` `logActivity` vs `modules/misc/timeline.ts` | `logActivity` creates `LeadActivity` records but these are NOT fed into the unified `TimelineEvent` system (IFC-069). Lead activities exist in a parallel silo — the "All Sources" toggle on lead detail shows ActivityFeed data, not LeadActivity data. |
| W2  | No email-to-lead association                | `modules/email/inbound.router.ts`                            | Inbound email parsing (IFC-144) creates email records but has no lead matching logic. Emails aren't linked to leads by sender address. Lead detail email tab shows activities filtered for `type: 'email'` — not real email integration data.            |
| W3  | `InMemoryEventBus` — events lost on restart | `apps/api/src/container.ts`                                  | Domain events (LeadCreatedEvent, LeadQualifiedEvent, etc.) are published to `InMemoryEventBus`. On server restart, all unprocessed events are lost. No persistent outbox pattern. No event replay capability.                                            |
| W4  | `leadListResponseSchema` key mismatch       | `packages/validators/src/lead.ts` lines 146-152              | Schema expects `data` key but router returns `leads` key. Validation would fail if ever enforced at runtime. Currently unchecked.                                                                                                                        |

### MEDIUM

| #   | Issue                                    | Location                                                    | Details                                                                                                                                                                                                                               |
| --- | ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W5  | Convert mutation missing `createAccount` | `leads/[id]/page.tsx` line 1169                             | Frontend sends `{ leadId }` only. `convertLeadSchema` accepts `createAccount` (boolean) and `accountName` (string) but neither is prompted. `LeadService.convertLead` has full account creation logic that's never triggered from UI. |
| W6  | `TotalLeadsWidget` hardcoded trend       | `components/dashboard/widgets/TotalLeadsWidget.tsx` line 43 | Shows hardcoded "+12%" trend indicator. Real lead count comes from API but growth percentage is fake.                                                                                                                                 |
| W7  | Analytics page fully hardcoded           | `app/analytics/(list)/page.tsx`                             | Dashboard analytics for leads use static sample data arrays. No API queries for lead analytics — charts render fake data.                                                                                                             |

### LOW

| #   | Issue                                      | Location                        | Details                                                                                                                                                                 |
| --- | ------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W8  | No CSV import/export for leads             | N/A                             | No bulk import (CSV upload) or export (CSV/JSON download) functionality. Common CRM feature missing entirely.                                                           |
| W9  | No webhook handlers for lead events        | `webhooks/handler.ts`           | Webhook infrastructure exists but has no lead-specific event handlers. External systems cannot subscribe to lead create/update/convert/delete events.                   |
| W10 | Only 3 of ~10 events trigger notifications | `modules/notifications/`        | `LeadCreatedEvent`, `LeadQualifiedEvent`, `LeadConvertedEvent` have notification handlers but ~7 other lead events (scored, status changed, assigned, etc.) are silent. |
| W11 | No BullMQ enqueue for lead notifications   | `workers/notifications-worker/` | Notification worker exists but lead events are handled synchronously in-process. No queue-based async processing for lead notifications.                                |

---

## 18. Domain & Validation Issues (added 2026-03-05 — comprehensive flow analysis)

### HIGH

| #   | Issue                                              | Location                                             | Details                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `Lead.toJSON()` omits Lead 360 fields              | `packages/domain/src/crm/lead/Lead.ts` lines 344-362 | `toJSON()` returns basic fields but omits `aiInsight`, `activities`, `notes`, `files`, `tasks` relations. Any code relying on `lead.toJSON()` for serialization gets incomplete data. The API bypasses this by reading Prisma directly, but domain events carry incomplete lead snapshots. |
| D2  | `qualify()` only allows NEW → QUALIFIED transition | `packages/domain/src/crm/lead/Lead.ts` line 300      | `qualify()` requires `status === 'NEW'                                                                                                                                                                                                                                                     |     | status === 'CONTACTED'`. But the UI shows qualify as an option regardless. A lead in NEGOTIATING status cannot be qualified via domain model, yet the router's `qualify`procedure wraps`Lead.qualify()`. |
| D3  | `LeadScoringChain` throws for unknown provider     | `apps/ai-worker/src/chains/`                         | If `AI_PROVIDER` env var is not `openai` or `ollama`, the scoring chain throws an unhandled error. No graceful degradation — all scoring calls fail.                                                                                                                                       |

### MEDIUM

| #   | Issue                                    | Location              | Details                                                                                                                                                                                                                              |
| --- | ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D4  | AI scoring chain ignores Lead 360 fields | `apps/ai-worker/src/` | The lead scoring prompt only receives basic lead data (name, company, title, source, status, score). Does not include activity count, engagement history, note count, file count, or existing AI insights for more accurate scoring. |

### LOW

| #   | Issue                                        | Location                                        | Details                                                                                                                                             |
| --- | -------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D5  | `leadResponseSchema` missing Lead 360 fields | `packages/validators/src/lead.ts` lines 127-142 | Response schema doesn't include `aiInsight`, `activities`, `notes`, `files`, `tasks` — validation would reject the actual API response if enforced. |

---

## 19. Test Coverage Gaps (added 2026-03-05 — comprehensive flow analysis)

| #   | Gap                                           | Location                                | Impact                                                                                                                             |
| --- | --------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Lead detail page (2200+ lines) — ZERO tests   | `leads/[id]/page.tsx`                   | Largest page in the app has no unit or integration tests. All 15 wiring fixes from 2026-03-04 are untested at the component level. |
| T2  | Lead list page — ZERO tests                   | `leads/(list)/page.tsx`                 | List page with filtering, sorting, bulk operations, saved views — completely untested.                                             |
| T3  | Lead create page — ZERO tests                 | `leads/(list)/new/page.tsx`             | 1029-line form with BANT fields, source handling, validation — untested. BANT drop bug (F3) would be caught by tests.              |
| T4  | `addNote` procedure — completely untested     | `lead.router.ts` `addNote` mutation     | Added 2026-03-04 but no test file covers it. Uses `window.prompt()` on frontend (F5).                                              |
| T5  | `logActivity` procedure — completely untested | `lead.router.ts` `logActivity` mutation | Added 2026-03-04 but no test file covers it. Uses `ctx.prisma` directly (S3).                                                      |
| T6  | No E2E tests for lead CRUD                    | `tests/e2e/`                            | No Playwright tests for create → view → edit → delete lead flow.                                                                   |
| T7  | Role-based filtering untested                 | `lead.router.ts` list procedure         | `filterByRole` logic (ADMIN sees all, others see own) has no dedicated test.                                                       |
| T8  | Bulk operations UI untested                   | `leads/(list)/page.tsx` bulk actions    | Bulk score, bulk convert, bulk archive, bulk delete — all untested at component level.                                             |
| T9  | Edit page `onSuccess` / `onError` untested    | `leads/[id]/edit/page.tsx`              | Mutation callbacks (success redirect, error toast) not covered. `as any` cast (F9) hides type errors.                              |

---

## 20. Priority Fixes (Master List)

### ~~P0 — Immediate (user-facing bugs)~~ All Fixed 2026-03-04

~~1. No activities for most leads~~ | ~~2. Error page shows "Lead Not Found" for
500s~~

### ~~P1 — High (misleading data)~~ All Fixed 2026-03-04

~~3. "Qualification Score" label~~ | ~~4. Hardcoded nextBestActions~~ | ~~5.
Hardcoded ChurnRisk factors~~ | ~~6. Hardcoded confidence~~ | ~~7. Owner title
hardcoded~~

### ~~P2 — Medium (missing functionality)~~ Mostly Fixed 2026-03-04

~~8. Add Note~~ | ~~9. Log Activity~~ | ~~10. Convert Lead~~ | ~~11.
Archive/Delete~~ 12. **Similar Leads** → Partially done (mock removed, needs
vector API) → **IFC-218**

### Previously Found (2026-03-05, second audit pass) — All Tasked

| #   | Issue                                    | Severity | Task    |
| --- | ---------------------------------------- | -------- | ------- |
| 13  | Email compose                            | P3       | IFC-217 |
| 14  | File upload/download                     | P3       | IFC-216 |
| 15  | Activity reactions/comments              | P3       | IFC-219 |
| 16  | Person filter                            | P3       | —       |
| 17  | Convert Lead button always visible       | P1       | IFC-225 |
| 18  | Engagement/ChurnRisk/Sentiment "Unknown" | P1       | IFC-226 |
| 19  | Recent Activity empty state no CTA       | P1       | IFC-236 |
| 20  | Company name not linked                  | P2       | IFC-227 |
| 21  | Map view placeholder                     | P2       | IFC-229 |
| 22  | Owner reassignment                       | P2       | IFC-228 |
| 23  | Convert Lead missing createAccount       | P2       | IFC-225 |
| 24  | Sidebar broken links                     | P1       | IFC-232 |
| 25  | Create/Edit form inconsistency           | P2       | IFC-230 |
| 26  | Settings pages hardcoded                 | P2       | IFC-234 |
| 27  | ~20 unused backend endpoints             | P2       | IFC-233 |
| 28  | Lead list saved views                    | P3       | IFC-231 |
| 29  | AI Chat on lead detail                   | P3       | IFC-235 |

### Comprehensive Flow Analysis (2026-03-05) — Tasks Created (IFC-237 to IFC-251)

**CRITICAL** (runtime crashes, security):

| #   | Ref | Issue                                                      | Task                    |
| --- | --- | ---------------------------------------------------------- | ----------------------- |
| 30  | S1  | `NEGOTIATING` status missing from detail page type         | **IFC-238** (Sprint 16) |
| 31  | S2  | `scoreWithAI` tenant isolation bypass via raw `ctx.prisma` | **IFC-237** (Sprint 16) |
| 32  | S3  | `logActivity` tenant isolation bypass via raw `ctx.prisma` | **IFC-237** (Sprint 16) |
| 33  | S4  | `bulkUpdateStatus` bypasses domain validation              | **IFC-237** (Sprint 16) |
| 34  | F1  | No auth guard on `/leads/new`                              | **IFC-238** (Sprint 16) |

**HIGH** (data integrity, fake data, security):

| #   | Ref | Issue                                                | Task                    |
| --- | --- | ---------------------------------------------------- | ----------------------- |
| 35  | S5  | `update` silently drops/leaks status field           | **IFC-239** (Sprint 16) |
| 36  | S6  | Score tier thresholds inconsistent (80/50 vs 70/40)  | **IFC-239** (Sprint 16) |
| 37  | S7  | `sortBy` accepts arbitrary strings (injection risk)  | **IFC-239** (Sprint 16) |
| 38  | S8  | No audit logging in lead router (GDPR)               | **IFC-240** (Sprint 18) |
| 39  | F2  | `ActiveLeadsWidget` fully hardcoded                  | **IFC-244** (Sprint 20) |
| 40  | F3  | BANT fields silently dropped in create form          | **IFC-242** (Sprint 18) |
| 41  | F4  | `annualRevenue` → `estimatedValue` semantic mismatch | **IFC-242** (Sprint 18) |
| 42  | W1  | `LeadActivity` not in unified timeline               | **IFC-245** (Sprint 20) |
| 43  | W2  | No email-to-lead association                         | **IFC-245** (Sprint 20) |
| 44  | W3  | `InMemoryEventBus` — events lost on restart          | **IFC-250** (Sprint 22) |
| 45  | W4  | `leadListResponseSchema` key mismatch                | **IFC-239** (Sprint 16) |
| 46  | D1  | `Lead.toJSON()` omits 360 fields                     | **IFC-246** (Sprint 20) |
| 47  | D2  | `qualify()` status constraints too restrictive       | **IFC-246** (Sprint 20) |
| 48  | D3  | `LeadScoringChain` throws for unknown provider       | **IFC-246** (Sprint 20) |

**MEDIUM** (UX issues, code quality):

| #   | Ref | Issue                                           | Task                    |
| --- | --- | ----------------------------------------------- | ----------------------- |
| 49  | S9  | `getHotLeads` tenant concern                    | **IFC-237** (Sprint 16) |
| 50  | S10 | Dead notification code in `scoreWithAI`         | **IFC-241** (Sprint 20) |
| 51  | S11 | `LeadRoutedEvent` never published               | **IFC-241** (Sprint 20) |
| 52  | F5  | `window.prompt()` for notes                     | **IFC-243** (Sprint 20) |
| 53  | F6  | Two `StatusBadge` implementations               | **IFC-243** (Sprint 20) |
| 54  | F7  | Two Toast patterns (sonner vs shadcn)           | **IFC-243** (Sprint 20) |
| 55  | F8  | `trpc` vs `api` import inconsistency            | **IFC-238** (Sprint 16) |
| 56  | F9  | Edit form `as any` cast, no client validation   | **IFC-242** (Sprint 18) |
| 57  | W5  | Convert mutation missing `createAccount` wiring | **IFC-225** (Sprint 16) |
| 58  | W6  | `TotalLeadsWidget` hardcoded "+12%" trend       | **IFC-244** (Sprint 20) |
| 59  | W7  | Analytics page fully hardcoded                  | **IFC-244** (Sprint 20) |
| 60  | D4  | AI scoring ignores Lead 360 fields              | **IFC-246** (Sprint 20) |

**LOW** (minor, enhancements):

| #   | Ref | Issue                                    | Task                    |
| --- | --- | ---------------------------------------- | ----------------------- |
| 61  | S12 | Prisma schema backslash comments         | **IFC-251** (Sprint 24) |
| 62  | W8  | No CSV import/export for leads           | **IFC-251** (Sprint 24) |
| 63  | W9  | No webhook handlers for lead events      | **IFC-250** (Sprint 22) |
| 64  | W10 | Only 3/10 events trigger notifications   | **IFC-241** (Sprint 20) |
| 65  | W11 | No BullMQ enqueue for lead notifications | **IFC-241** (Sprint 20) |
| 66  | D5  | `leadResponseSchema` missing 360 fields  | **IFC-239** (Sprint 16) |

**TEST COVERAGE GAPS**:

| #   | Ref | Gap                                         | Task                    |
| --- | --- | ------------------------------------------- | ----------------------- |
| 67  | T1  | Lead detail page (2200+ lines) — ZERO tests | **IFC-247** (Sprint 18) |
| 68  | T2  | Lead list page — ZERO tests                 | **IFC-248** (Sprint 18) |
| 69  | T3  | Lead create page — ZERO tests               | **IFC-248** (Sprint 18) |
| 70  | T4  | `addNote` procedure untested                | **IFC-247** (Sprint 18) |
| 71  | T5  | `logActivity` procedure untested            | **IFC-247** (Sprint 18) |
| 72  | T6  | No E2E tests for lead CRUD                  | **IFC-249** (Sprint 20) |
| 73  | T7  | Role-based filtering untested               | **IFC-248** (Sprint 18) |
| 74  | T8  | Bulk operations UI untested                 | **IFC-248** (Sprint 18) |
| 75  | T9  | Edit page callbacks untested                | **IFC-249** (Sprint 20) |

---

## 21. Changes Log

### 2026-03-04 — Wiring Fix Session

**Backend** (`apps/api/src/modules/lead/lead.router.ts`):

- A1: Added `role: true` to owner select in `getById`
- A2: Added `lead.addNote` mutation (creates LeadNote with tenant isolation)
- A3: Added `lead.logActivity` mutation (transaction: creates LeadActivity +
  updates `lastContactedAt`)

**Frontend** (`apps/web/src/app/leads/[id]/page.tsx`):

- B1: Error handling differentiates 404 / 500 / generic with retry button
- B2: Owner title mapped from `owner.role` via role-to-title map
- B3: "Qualification Score" → "Lead Score" (2 occurrences)
- B4: Next best actions derived from `insight.nextBestAction` text
- B5: ChurnRisk factors already data-derived (kept as-is)
- B6: Confidence derived from `engagementScore`
- B7: Delete button wired with AlertDialog confirmation
- B8: Archive button wired with AlertDialog confirmation
- B9: Convert Lead button wired with mutation + redirect
- B10: Add Note + Log Activity wired to new API mutations
- B11: `mockSimilarLeads` removed, replaced with empty state
- B12: NextBestAction rationale/alternatives derived from insight data

**Seed data** (`packages/db/prisma/seed.ts`, `packages/db/src/seed-ids.ts`):

- C1: 27 new lead activities across 12 previously-empty leads (2-3 per lead)
- C2: 5 additional lead notes (sarahMiller, davidChen, ninaPatel,
  elenaRodriguez, rachelGreen)
- C3: 4 additional lead files (sarahMiller, davidChen, ninaPatel,
  elenaRodriguez)

**Validation**: TypeScript, Tests, Lint, Build — all PASS

### 2026-03-05 — Debt Logging & Follow-up Task Creation

**Debt entries logged** (7 `WIRE-*` entries in `docs/debt-ledger.yaml`):

- WIRE-IFC-094-001 → IFC-216 (file upload/download)
- WIRE-IFC-144-001 → IFC-217 (email compose)
- WIRE-IFC-099-001 → IFC-221 (email open tracking)
- WIRE-IFC-039-001 → IFC-218 (similar entity API)
- WIRE-PG-141-001 → IFC-217 (email compose, shared remediation)
- WIRE-IFC-095-001 → IFC-220 (AI insight null-state Contact)
- WIRE-IFC-069-001 → IFC-219 (activity reactions/comments)

**Follow-up tasks created** (6 new tasks in Sprint_plan.csv):

- IFC-216: Entity Detail File Upload/Download Wiring (Sprint 23)
- IFC-217: Entity Detail Email Compose Wiring (Sprint 22)
- IFC-218: Similar Entity API via pgvector (Sprint 20)
- IFC-219: Activity Feed Interactions — Reactions + Comments (Sprint 20)
- IFC-220: AI Insight Null-State UX for Contact (Sprint 16)
- IFC-221: Email Open Tracking Integration (Sprint 22)

**Backlog tasks amended** (5 CSV rows updated with cross-entity scope):

- PG-074 (Opportunity Detail): Added CRITICAL note re SAMPLE_DEAL hardcoding
- PG-089 (Files Page): Added cross-entity file upload/download scope
- PG-084 (Emails Page): Added cross-entity EmailCompose wiring scope
- PG-162 (AI Insights): Added null-state UX scope for Contact
- PG-145 (NBA Dashboard): Added multi-factor impact scoring scope

### 2026-03-05 — Second Audit Pass: Additional Tasks Created

**Additional issues identified** (6 from second audit pass + 6 from
user-reported bugs):

**Follow-up tasks created** (11 new tasks, IFC-225 to IFC-235):

- IFC-225: Convert Lead UX Fix — disable for non-QUALIFIED, add confirmation
  dialog (Sprint 16, P1)
- IFC-226: Lead Detail Null-State UX — fix "Unknown" engagement badges (Sprint
  16, P1)
- IFC-236: Recent Activity Empty State CTA — add "Log your first activity"
  button (Sprint 16, P1)
- IFC-227: Company-to-Account Navigation Link — replace `<span>` with `<Link>`
  (Sprint 18, P2)
- IFC-228: Lead Owner Reassignment UI — MANAGER/ADMIN user picker (Sprint 20,
  P2)
- IFC-229: Lead Detail Map View — replace gradient placeholder or remove (Sprint
  20, P2)
- IFC-230: Unify Lead Create/Edit Form — extract shared LeadForm, fix BANT drop
  (Sprint 18, P2)
- IFC-231: Lead List Saved Views — wire URL params, column picker, persistent
  filters (Sprint 22, P3)
- IFC-232: Sidebar Broken Links Cleanup — fix 17 nav + 6 settings 404s (Sprint
  16, P1)
- IFC-233: Wire Unused Backend tRPC Endpoints — ~20 procedures across 5 routers
  (Sprint 20, P2)
- IFC-234: Settings Pages Wiring — Team/Integrations/Notifications/Account
  (Sprint 18, P2)
- IFC-235: Lead Detail AI Chat Panel — register conversation router + build UI
  (Sprint 22, P3)

### 2026-03-05 — Third Audit Pass: Comprehensive Lead Flow Analysis

**Scope**: All lead-related code across backend (router, domain, validators,
events), frontend (detail, list, create, edit, dashboard widgets), AI worker
(scoring chain), and integration points (email, timeline, notifications,
webhooks).

**Method**: 4 parallel Explore agents analyzed backend API flows, frontend
pages/components, test coverage, and integration/workflow gaps.

**Findings**: 48 new issues documented in §15-19:

- 5 CRITICAL (runtime crash, tenant isolation bypass, domain bypass, auth gap)
- 14 HIGH (data integrity, fake data, GDPR, injection risk)
- 12 MEDIUM (UX issues, code inconsistency, dead code)
- 6 LOW (minor enhancements)
- 9 Test coverage gaps (3 pages with zero tests, 6 untested procedures/flows)

**Detailed sections added**: §15 Backend Security, §16 Frontend Consistency, §17
Integration & Workflow, §18 Domain & Validation, §19 Test Coverage

**Tasks created** (15 new tasks, IFC-237 to IFC-251):

- IFC-237: Lead Router Security — Tenant Isolation & Domain Bypass (Sprint 16,
  CRITICAL) — S2,S3,S4,S9
- IFC-238: Lead Detail Status Type Fix + Auth Guard (Sprint 16, CRITICAL) —
  S1,F1,F8
- IFC-239: Lead Router Data Integrity Fixes (Sprint 16, HIGH) — S5,S6,S7,W4,D5
- IFC-240: Lead Audit Logging (Sprint 18, HIGH) — S8
- IFC-241: Lead Router Dead Code & Missing Events (Sprint 20, MEDIUM) —
  S10,S11,W10,W11
- IFC-242: Lead Create Form Fixes — BANT, Revenue, Validation (Sprint 18, HIGH)
  — F3,F4,F9
- IFC-243: Lead Frontend Consistency — StatusBadge, Toast, Prompt (Sprint 20,
  MEDIUM) — F5,F6,F7
- IFC-244: Dashboard Widget Real Data — ActiveLeads, TotalLeads, Analytics
  (Sprint 20, HIGH) — F2,W6,W7
- IFC-245: Lead Activity Timeline Unification (Sprint 20, HIGH) — W1,W2
- IFC-246: Domain Model Lead 360 Alignment (Sprint 20, HIGH) — D1,D2,D3,D4
- IFC-247: Lead Detail Page Tests (Sprint 18, TEST) — T1,T4,T5
- IFC-248: Lead List & Create Page Tests (Sprint 18, TEST) — T2,T3,T7,T8
- IFC-249: Lead Edit Page Tests + E2E (Sprint 20, TEST) — T6,T9
- IFC-250: Lead Event Pipeline — Outbox + Webhooks (Sprint 22, MEDIUM) — W3,W9
- IFC-251: Lead CSV Import/Export (Sprint 24, LOW) — W8,S12
