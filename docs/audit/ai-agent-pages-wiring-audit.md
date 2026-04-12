# AI & Agent Pages — Wiring Audit

**Routes**: `apps/web/src/app/agent-approvals/**`,
`apps/web/src/app/settings/ai/**` **Primary Components**:
`apps/web/src/components/ai-review/**`,
`apps/web/src/components/ai-intelligence/**`,
`apps/web/src/components/ai-monitoring/**`,
`apps/web/src/components/insights/InsightsListPage.tsx` **Primary APIs**:
`apps/api/src/modules/autoresponse/autoresponse.router.ts`,
`apps/api/src/modules/agent/agent.router.ts`,
`apps/api/src/modules/ai-review/ai-review.router.ts`,
`apps/api/src/modules/ai-monitoring/ai-monitoring.router.ts`,
`apps/api/src/modules/intelligence/intelligence.router.ts`,
`apps/api/src/modules/chain-version/chain-version.router.ts`,
`apps/api/src/modules/home/home.router.ts` **Date**: 2026-03-08

---

## Summary

| Area                       | Wired | Partially Wired | Not Wired |
| -------------------------- | ----: | --------------: | --------: |
| Approval workflows         |     1 |               4 |         1 |
| AI intelligence dashboards |     2 |               5 |         0 |
| Monitoring dashboards      |     2 |               2 |         1 |
| AI settings                |     0 |               1 |         0 |
| **Total routes**           | **5** |          **12** |     **2** |

Legend:

- **Wired** = backed by real queries/mutations and behaves correctly end-to-end
- **Partially Wired** = uses real APIs but has broken filters, stale UI, missing
  route support, or placeholder-derived values
- **Not Wired** = route or linked destination does not actually exist

---

## Route Matrix

| Route                             | Primary data source                                                           | Status          | Notes                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| `/agent-approvals`                | `autoResponse.*` + `agent.getPendingCount`                                    | Partially Wired | Real mutations, but uses seeded fallback IDs, ignores most URL filters, and masks entity names |
| `/agent-approvals/preview`        | `agent.getPendingApprovals`, `agent.approveAction`, `agent.rejectAction`      | Wired           | Real approval flow, proper refresh after decisions                                             |
| `/agent-approvals/ai-review`      | `aiReview.list`, `aiReview.stats`, review mutations                           | Partially Wired | Search is a no-op; "Load More" replaces pages instead of appending                             |
| `/agent-approvals/ai-review/[id]` | `aiReview.get`, `claim`, `approve`, `reject`, `escalate`                      | Partially Wired | Lock token is volatile client state; refresh breaks decision actions                           |
| `/agent-approvals/history`        | `aiReview.list`, `aiReview.stats`                                             | Partially Wired | Real data, but "Load More" replaces current page instead of accumulating history               |
| `/agent-approvals/insights`       | `home.getAllInsights`                                                         | Partially Wired | Real query, but cursor pagination replaces the list rather than appending                      |
| `/agent-approvals/lead-scoring`   | `intelligence.getLeadScoringDashboard`                                        | Partially Wired | Real dashboard, but page-based "Load More" replaces earlier rows                               |
| `/agent-approvals/sentiment`      | `intelligence.getSentimentDashboard`                                          | Partially Wired | Real dashboard, but page-based "Load More" replaces earlier rows                               |
| `/agent-approvals/churn-risk`     | `intelligence.getChurnDashboard`                                              | Partially Wired | Real dashboard, but page-based "Load More" replaces earlier rows                               |
| `/agent-approvals/ai-search`      | `intelligence.ragSearch`                                                      | Partially Wired | Search itself is real; conversation citations link to a missing/incompatible logs route        |
| `/agent-approvals/experiments`    | `experiment.*`                                                                | Partially Wired | Real actions, but lifecycle mutations do not invalidate/refetch list data                      |
| `/agent-approvals/tools`          | `agent.listTools`, `agent.getTool`, `agent.executeTool`                       | Partially Wired | Real registry, but "Test Execute" always submits `{}` input                                    |
| `/agent-approvals/agents`         | `aiMonitoring.getActiveAgents`, `getStatus`, queue admin                      | Partially Wired | Main dashboard is real, but links out to missing logs routes                                   |
| `/agent-approvals/drift`          | `aiMonitoring.getStatus`, `getDriftMetrics`, `getROIMetrics`, `getFailedJobs` | Wired           | Honest unavailable-state handling; no fake monitoring data                                     |
| `/agent-approvals/latency`        | `aiMonitoring.getLatencyMetrics`, `getLatencyTrend`                           | Wired           | Honest unavailable-state handling; no fake monitoring data                                     |
| `/agent-approvals/logs`           | Intended `aiMonitoring.getAgentLogs` / `getFailedJobs`                        | Not Wired       | Component exists, route does not                                                               |
| `/agent-approvals/logs/[agentId]` | Intended `aiMonitoring.getAgentLogs`                                          | Not Wired       | Linked from Active Agents, but route does not exist                                            |
| `/settings/ai`                    | `chainVersion.*`                                                              | Partially Wired | Core version list is real, but audit/admin gating and memory budget are not fully wired        |

---

## Findings

### A1 (CRITICAL) — Agent Logs Navigation Is Broken End-to-End

**What happens**

- Sidebar links point to `/agent-approvals/logs`
- Active Agents links point to `/agent-approvals/logs/${agentId}`
- AI Search conversation citations point to `/agent-approvals/logs?id=${id}`
- No corresponding route exists under `apps/web/src/app/agent-approvals`

**Evidence**

- Sidebar link: `apps/web/src/components/sidebar/configs/agent-approvals.ts:154`
- Active Agents link:
  `apps/web/src/components/ai-monitoring/ActiveAgentsDashboard.tsx:158`
- Search citation link: `apps/web/src/lib/ai-search/search-utils.ts:63`
- Intended component only:
  `apps/web/src/components/ai-monitoring/AgentLogsViewer.tsx:8`
- Missing route: no `logs/page.tsx` or `logs/[agentId]/page.tsx` under
  `apps/web/src/app/agent-approvals`

**Impact**

- Two visible navigation paths land on 404s
- AI Search deep links for conversation results are dead
- Monitoring flow is incomplete despite a finished component

---

### A2 (CRITICAL) — `/agent-approvals` Uses Seeded Fallback IDs and a Cross-Tenant Stats Input

**What happens**

- The dashboard falls back to hardcoded seeded `userId` and `tenantId`
- `autoResponse.getStatsByStatus` is a `protectedProcedure` that accepts
  caller-supplied `tenantId`
- The page always uses the seeded default tenant ID when auth context lacks one

**Evidence**

- Fallback user ID: `apps/web/src/app/agent-approvals/page.tsx:801`
- Fallback tenant ID: `apps/web/src/app/agent-approvals/page.tsx:806`
- Stats query call: `apps/web/src/app/agent-approvals/page.tsx:838`
- Analytics endpoint definition:
  `apps/api/src/modules/autoresponse/autoresponse.router.ts:778`
- Endpoint counts by input tenant, not context tenant:
  `apps/api/src/modules/autoresponse/autoresponse.router.ts:796`

**Impact**

- Dashboard metrics can show the wrong tenant's data
- Endpoint design allows authenticated callers to request another tenant's
  aggregate stats if they know the ID
- Violates the repo rule against displaying non-real fallback data

---

### A3 (HIGH) — AI Review Locks Break After Refresh

**What happens**

- Queue and detail flows store lock tokens only in ephemeral client state
- After a claim, a refresh preserves backend status (`IN_REVIEW`) but drops the
  token
- The UI only renders approve/reject/escalate actions when `lockToken` is still
  present

**Evidence**

- Queue lock token map is local `useRef`:
  `apps/web/src/lib/ai-review/hooks.ts:33`
- Detail lock token state:
  `apps/web/src/app/agent-approvals/ai-review/[id]/page.tsx:53`
- Detail actions require token:
  `apps/web/src/app/agent-approvals/ai-review/[id]/page.tsx:142`, `:147`, `:158`
- Detail action buttons gated by token:
  `apps/web/src/app/agent-approvals/ai-review/[id]/page.tsx:332`
- Queue cards also gate review actions on token presence:
  `apps/web/src/components/ai-review/ReviewCard.tsx:237`

**Impact**

- Claimed reviews can become undealable from the UI after reload/navigation
- Reviewers can get stuck with an item marked `IN_REVIEW` but no visible
  recovery path

---

### A4 (HIGH) — "Load More" Pagination Is Broken Across Multiple AI Pages

**Affected routes**

- `/agent-approvals/ai-review`
- `/agent-approvals/history`
- `/agent-approvals/insights`
- `/agent-approvals/lead-scoring`
- `/agent-approvals/sentiment`
- `/agent-approvals/churn-risk`
- Intended `/agent-approvals/logs`

**What happens**

- The UI increments `page`, `offset`, or `cursor`
- Hooks return only the current query result
- Components render only the latest page instead of appending previous pages

**Evidence**

- Review queue page increment only:
  `apps/web/src/components/ai-review/ReviewQueue.tsx:184`
- Review history page increment only:
  `apps/web/src/components/ai-intelligence/ReviewHistory.tsx:377`
- Insights cursor replacement:
  `apps/web/src/components/insights/InsightsListPage.tsx:97`, `:123`
- Lead scoring page increment:
  `apps/web/src/components/ai-intelligence/LeadScoringDashboard.tsx:278`, `:300`
- Sentiment page increment:
  `apps/web/src/components/ai-intelligence/SentimentDashboard.tsx:259`, `:298`
- Churn page increment:
  `apps/web/src/components/ai-intelligence/ChurnDashboard.tsx:225`, `:262`
- Agent logs offset-based slice only:
  `apps/web/src/lib/ai-monitoring/hooks.ts:172`, `:186`

**Impact**

- "Load More" does not behave like cumulative pagination
- Users can lose context when they expect to see earlier rows retained
- Counts and pagination UX are misleading

---

### A5 (HIGH) — Review Queue Search Is a No-Op

**What happens**

- The queue exposes "Search reviews..."
- Search input only updates local UI state
- That value is never applied to the query or a client-side filter

**Evidence**

- Search input wiring: `apps/web/src/components/ai-review/ReviewQueue.tsx:258`
- Search change handler only updates filter state:
  `apps/web/src/components/ai-review/ReviewQueue.tsx:259`
- Query filter sync helper exists but is never called for search:
  `apps/web/src/components/ai-review/ReviewQueue.tsx:126`

**Impact**

- The page advertises a filter that does nothing
- Reviewers cannot search the queue even though the UI suggests they can

---

### A6 (HIGH) — `/settings/ai` Memory Tab Uses Placeholder Budget Data

**What happens**

- `chainVersion.getZepBudget` reads environment defaults, not live provider
  usage
- It explicitly returns `isPersisted: false` and `lastSyncedAt: null`
- Default totals are hardcoded to a nominal 1000-episode budget when env vars
  are absent

**Evidence**

- Hook usage: `apps/web/src/app/settings/ai/hooks/useChainVersions.ts:383`
- Endpoint definition:
  `apps/api/src/modules/chain-version/chain-version.router.ts:314`
- Placeholder persistence flag:
  `apps/api/src/modules/chain-version/chain-version.router.ts:339`

**Impact**

- The memory tab is not backed by real Zep metering
- Violates the project rule: "Never Mock or Simulate Data"
- Users can interpret placeholder quota as live operational usage

---

### A7 (HIGH) — `/settings/ai` Audit Tab Has an Admin/UI Contract Mismatch

**What happens**

- The page is visible to ordinary authenticated users
- Audit data comes from `chainVersion.getAuditLog`, which is `adminProcedure`
- `useVersionAudit` exposes errors, but `AISettingsContent` ignores them and
  passes only `auditLog` + `isLoading` into the table

**Evidence**

- Audit hook wiring: `apps/web/src/app/settings/ai/AISettingsContent.tsx:101`
- Audit table render: `apps/web/src/app/settings/ai/AISettingsContent.tsx:395`
- Hook error exists:
  `apps/web/src/app/settings/ai/hooks/useChainVersions.ts:352`
- Backend admin-only audit endpoint:
  `apps/api/src/modules/chain-version/chain-version.router.ts:252`

**Impact**

- Non-admin users can reach an admin-oriented page and silently get an empty
  audit tab
- Authorization failures are obscured instead of surfaced

---

### A8 (MEDIUM) — Existing Draft Editing Is Not Reachable in `/settings/ai`

**What happens**

- `AISettingsContent` maintains `editingVersion`
- `ChainVersionEditor` supports `existingDraft`
- No table action passes an existing draft into the editor

**Evidence**

- Edit state exists: `apps/web/src/app/settings/ai/AISettingsContent.tsx:72`
- Create flow only clears the edit state:
  `apps/web/src/app/settings/ai/AISettingsContent.tsx:322`
- Editor receives `existingDraft={editingVersion}`:
  `apps/web/src/app/settings/ai/AISettingsContent.tsx:481`
- Table exposes no edit callback prop:
  `apps/web/src/app/settings/ai/components/ChainVersionsTable.tsx:39`

**Impact**

- Draft update capability exists in code but is not reachable from the page
- "Admin UI" is incomplete for the DRAFT lifecycle

---

### A9 (MEDIUM) — Main Agent Approvals Route Ignores Most Sidebar Filters

**What happens**

- Sidebar links advertise `?priority=urgent`, `?view=my`, `?status=approved`,
  `?status=rejected`
- The page only initializes `filterStatus` when `status === escalated`

**Evidence**

- Sidebar links: `apps/web/src/components/sidebar/configs/agent-approvals.ts`
- Only supported URL status: `apps/web/src/app/agent-approvals/page.tsx:792`

**Impact**

- Multiple nav items route to the same unfiltered dashboard
- Users get misleading navigation and cannot deep-link meaningful filtered views

---

### A10 (MEDIUM) — Main Agent Approvals Cards Do Not Show Real Entity Names

**What happens**

- Drafts are mapped to `entityName: Lead <id>...`
- No lead/account/contact lookup is performed for display labels

**Evidence**

- Mapping logic: `apps/web/src/app/agent-approvals/page.tsx` in
  `mapDraftToAction()`

**Impact**

- Page is technically connected to real drafts but degrades identity into masked
  placeholders
- Approval decisions are harder because reviewers do not see the actual entity
  label

---

### A11 (MEDIUM) — Experiment Lifecycle Actions Do Not Refresh the List

**What happens**

- `start`, `pause`, `complete`, `archive` mutations are called directly
- The experiment list hook does not invalidate or refetch after any mutation

**Evidence**

- Mutation-only hook: `apps/web/src/lib/experiments/hooks.ts:36`
- Dashboard action wiring:
  `apps/web/src/components/ai-intelligence/ExperimentsDashboard.tsx:102`, `:149`

**Impact**

- Experiment status can remain stale until manual refresh
- Users do not get reliable feedback after taking lifecycle actions

---

### A12 (MEDIUM) — AI Search Conversation Citations Target the Wrong Log Shape

**What happens**

- Conversation citations deep-link to `/agent-approvals/logs?id=${id}`
- `AgentLogsViewer` filters by `agentId`, not conversation ID
- The route itself is missing anyway

**Evidence**

- Citation route builder: `apps/web/src/lib/ai-search/search-utils.ts:63`
- Logs viewer input contract:
  `apps/web/src/components/ai-monitoring/AgentLogsViewer.tsx:432`

**Impact**

- Even after adding a logs page, conversation-result links would still not open
  the intended record without route/query redesign

---

### A13 (MEDIUM) — Agent Tools "Test Execute" Uses Empty Input for Every Tool

**What happens**

- The tools page always calls `agent.executeTool` with `input: {}`
- Many tools will require structured input to preview or execute meaningfully

**Evidence**

- Hardcoded execute payload:
  `apps/web/src/app/agent-approvals/tools/page.tsx:189`

**Impact**

- "Test Execute" only works for tools that tolerate empty input
- Registry page is partially operational as a tooling console

---

### A14 (CRITICAL) — Agent Router Lacks Tenant Isolation

**What happens**

- Endpoints like `executeTool` and `getPendingApprovals` use
  `protectedProcedure` instead of `tenantProcedure`.
- Agent context is built using only `userId` without strictly enforcing
  `tenantId`.

**Evidence**

- Endpoint definitions: `apps/api/src/modules/agent/agent.router.ts`
  (`listTools`, `executeTool`, `getPendingApprovals`).

**Impact**

- Severe isolation risk where a user could potentially execute tools or pull
  pending approvals across tenant boundaries.

---

### A15 (CRITICAL) — OOM Risk in Intelligence Router

**What happens**

- `getSentimentDashboard` fetches all `LeadAIInsight` and `ContactAIInsight`
  rows generated within the trailing 30-90 days into memory at once.
- Pagination is applied in-memory (`paginateRows()`) on the Node.js server.

**Evidence**

- Fetch all call: `apps/api/src/modules/intelligence/intelligence.router.ts:489`
  (`await fetchAllInsightRows(...)`).
- Pagination call:
  `apps/api/src/modules/intelligence/intelligence.router.ts:520`.

**Impact**

- At production scale, this will crash the backend API due to memory exhaustion.

---

### A16 (HIGH) — Auto-Response Router Trusts Client `leadTenantId`

**What happens**

- The `.create` mutation accepts and trusts the `leadTenantId` directly from the
  client payload.
- It does not assert that the lead actually belongs to the caller's active
  context.

**Evidence**

- Input schema: `apps/api/src/modules/autoresponse/autoresponse.router.ts`
  (`leadTenantId: idSchema`).
- Usage: `apps/api/src/modules/autoresponse/autoresponse.router.ts`.

**Impact**

- A malicious actor could spoof cross-tenant leads if the IDs were known.

---

### A17 (HIGH) — Client-Side Filtering Over Paginated API Data

**What happens**

- Dashboards like `ChurnDashboard` pass pagination parameters (`limit: 20`) to
  the backend.
- UI filters (`searchQuery`, `riskLevel`) are implemented purely via vanilla
  React array `.filter()` on the current page of items.

**Evidence**

- Filter local state usage:
  `apps/web/src/components/ai-intelligence/ChurnDashboard.tsx`.

**Impact**

- If a user filters/searches for an item that is on page 2, the row will vanish
  and never be found.

---

### A18 (HIGH) — Insights Search is Disconnected from the Backend

**What happens**

- `InsightsListPage` accepts user text search input but the backend
  `/home/getAllInsights` endpoint has no `search` parameter.
- The UI filters only the visible chunk of 20 items.

**Evidence**

- UI search logic: `apps/web/src/components/insights/InsightsListPage.tsx`.

**Impact**

- The search functionality is fundamentally broken as it only filters the
  current page.

---

## Positive Findings

1. `/agent-approvals/preview` is properly wired to the real agent approval
   router and refreshes counts after decisions.
2. `/agent-approvals/drift` and `/agent-approvals/latency` explicitly surface
   unavailable-state banners instead of inventing fake monitoring data.
3. Lead scoring, sentiment, churn, AI search, insights, and review history all
   use real backend queries rather than local mock datasets in production code.
4. `aiReview.*`, `aiMonitoring.*`, `intelligence.*`, and `chainVersion.*` routes
   are backed by actual tRPC procedures rather than dead UI shells.

---

## Priority Fixes

| Priority | Finding IDs   | Description                                                                                                                |
| -------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| P0       | A1, A2        | Create the missing logs routes and remove hardcoded tenant/user fallbacks plus caller-supplied tenant analytics            |
| P0       | A14, A15      | Fix severe tenant isolation bugs in agent router and memory exhaustion (OOM) risks in intelligence router                  |
| P1       | A3, A4, A5    | Fix review lock persistence and the broken pagination/search flows across AI pages                                         |
| P1       | A6, A7        | Replace placeholder Zep budget data and align `/settings/ai` UI permissions with backend admin rules                       |
| P1       | A16, A17, A18 | Secure Auto-Response payload from client spoofing, and implement server-side search and filtering for dashboards           |
| P2       | A8, A9, A10   | Finish draft editing, honor sidebar filter links, and display real entity labels on approval cards                         |
| P2       | A11, A12, A13 | Refresh experiment state after mutations, repair AI Search log deep links, and give tools page valid execution input paths |

---

## Changes Log

| Date       | Change                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-08 | Created initial AI and agent pages audit covering `/agent-approvals/**`, linked monitoring destinations, and `/settings/ai` |
| 2026-03-09 | Deep code audit added critical/high priority findings A14-A18 based on routing and component implementations                |
