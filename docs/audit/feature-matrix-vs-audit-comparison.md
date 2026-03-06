# Feature Matrix vs Wiring Audit — Cross-Reference Analysis

**Date**: 2026-03-06 **Feature Matrix**:
`docs/company/product/feature-matrix.md` (501 features, 61 in scope) **Audit
Documents**: 4 entity audits totalling 239 findings

---

## Executive Summary

The feature matrix tracks **plan coverage** — whether Sprint_plan.csv tasks
exist for each of the 6 architectural layers (Entity, Domain, Database, Adapter,
Router, Frontend). All 61 features across the 4 entity groups show `complete`
plan coverage with zero missing layers and zero `at_risk` entries.

The wiring audits found **239 implementation defects** hiding behind that
"complete" facade. The matrix answers "do we have a plan?" — the audits answer
"does it actually work?"

### The Numbers

| Entity    | Matrix Features | Matrix `done` | Matrix `planned` | Audit Findings | Audit Tasks Created     |
| --------- | --------------- | ------------- | ---------------- | -------------- | ----------------------- |
| Lead      | 7               | 1 (14%)       | 6                | 75             | IFC-216 to IFC-251 (36) |
| Contact   | 14              | 8 (57%)       | 6                | 79             | IFC-252 to IFC-266 (15) |
| Account   | 7               | 4 (57%)       | 3                | 43             | IFC-267 to IFC-277 (11) |
| Deal      | 33              | 8 (24%)       | 22               | 42             | IFC-278 to IFC-287 (10) |
| **Total** | **61**          | **21 (34%)**  | **37**           | **239**        | **72**                  |

### Key Insight

**20 features marked `done` in the matrix have audit findings within them.** The
matrix `done` status means "code exists and tasks are complete" — not "code
works end-to-end." The audits reveal that `done` features can harbour CRITICAL
security vulnerabilities, 100% hardcoded pages, and dozens of no-op buttons.

---

## Part 1: What the Matrix Gets Right

### 1.1 Plan Coverage Is Genuinely Complete

Every feature across all 4 entity groups has Sprint_plan.csv tasks assigned to
all required layers. There are no orphaned features with missing task
assignments. This is accurate.

### 1.2 Layer Strength Ordering Is Correct

The matrix reports Database/Adapter as the strongest layers and Router/Frontend
as the weakest. The audits confirm this:

| Layer         | Matrix Assessment                       | Audit Confirmation                                                                         |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Entity/Domain | Strongest (done on nearly all rows)     | Confirmed — domain models are sound across all 4 entities                                  |
| Database      | Strong (done on all rows)               | Confirmed — Prisma schemas exist and are correct                                           |
| Adapter       | Mixed (done on some, partial on others) | Confirmed BUT with caveats — 3 cross-tenant data leaks found in repositories marked "done" |
| Router        | Weak (partial on most rows)             | Confirmed — procedures exist but zero audit logging across all 4 entities                  |
| Frontend      | Weakest (partial on most rows)          | Confirmed — detail pages have 51 no-op buttons, 1 fully hardcoded page                     |

### 1.3 Contact Is the Most Mature Entity

Matrix: 8/14 done (57%). Audit: Best wiring ratio at 26 wired / 6 partial / 24
not-wired. Both the matrix and audit agree Contact is furthest along, though the
audit reveals 79 issues within that "most mature" status.

### 1.4 Deal CPQ Sub-cluster Is Correctly `planned`

The matrix marks Quote, Order, and Price Book features as `planned` with
`partial` Entity layers. The audit confirms zero CPQ infrastructure exists on
the frontend — these are genuinely future work.

---

## Part 2: What the Matrix Misses

### 2.1 Features Marked `done` With CRITICAL Bugs (Security)

| Feature (Matrix `done`)      | Layer Marked Done | CRITICAL Finding                                                                                                                 |
| ---------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Account Adapter Layer        | Adapter: done     | **WIRE-IFC-094-001**: `PrismaAccountRepository` has zero `tenantId` filtering — cross-tenant data leak on every query            |
| Deal/Opportunity tRPC Router | Adapter: done     | **F-B01**: `PrismaOpportunityRepository.findById()` has NO tenantId — cross-tenant data leak for getById/update/delete/moveStage |
| Contact tRPC Router          | Router: done      | 3 procedures use raw `ctx.prisma` without tenant isolation                                                                       |

The matrix cannot detect **security-level implementation gaps** within layers
marked `done`. A layer being "done" means the code file exists and the task was
marked complete — it does not validate that tenant isolation, input
sanitization, or audit logging are implemented.

### 2.2 The SAMPLE_DEAL Problem — `done` Means Nothing

The matrix marks "Deal/Opportunity tRPC Router" and "Deals Pipeline - Kanban
Board" as `done`, and "Opportunity Detail" as `planned`. But:

- **The deal detail page (`deals/[id]/page.tsx`)** is 100% hardcoded with
  `SAMPLE_DEAL` constant — zero API calls, zero real data
- The tRPC router has 16 procedures that work — but the detail page doesn't call
  any of them
- 14 action buttons on the detail page have `onClick: () => {}` (empty handlers)
- There is no `/deals/new` route — the "New Deal" button links to a 404

The matrix correctly marks "Opportunity Detail" as `planned`, but it doesn't
flag that the page **exists and renders** — just with fake data. A user visiting
`/deals/123` sees a fully-rendered page with no indication that everything is
fabricated.

### 2.3 No-Op Button Epidemic (51 Buttons Across 4 Entities)

The matrix has no mechanism to detect non-functional UI elements:

| Entity    | No-Op Buttons | Examples                                                                                                      |
| --------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| Lead      | 12            | Email Compose, Document Upload/Download, Owner Assign, Map View                                               |
| Contact   | 19            | All 6 action header buttons, Email Compose, Document Upload, Owner Assign, Activity reactions                 |
| Account   | 6             | Create Deal, Add Contact (×2), Create Opportunity (×2), Owner Assign                                          |
| Deal      | 14            | Won, Lost, Edit, Clone, Archive, Delete, Add Stakeholder, Add Product, Upload File (×3), Manage Contacts (×2) |
| **Total** | **51**        |                                                                                                               |

These are all on pages the matrix considers at least partially "done." The
matrix tracks whether a Frontend task exists, not whether the rendered buttons
do anything.

### 2.4 Zero Audit Logging Across All 4 Entity Routers

The matrix marks the router layers as `done` or `partial` for all 4 entities.
None of them have any `auditLogger.log()` calls:

- `lead.router.ts`: 34 procedures, 0 audit log calls
- `contact.router.ts`: ~30 procedures, 0 audit log calls
- `account.router.ts`: 15 procedures, 0 audit log calls
- `opportunity.router.ts`: 16 procedures, 0 audit log calls

This is a compliance gap invisible to the feature matrix.

### 2.5 Dead Code and Stubs in `done` Layers

| Entity  | Dead Code/Stubs                                                                   | Matrix Status       |
| ------- | --------------------------------------------------------------------------------- | ------------------- |
| Deal    | 11 dead public methods in `OpportunityService.ts` unreachable from router         | Service layer: done |
| Lead    | `findSimilar()` always returns `[]`                                               | Adapter: partial    |
| Contact | `findDuplicates()` is a stub                                                      | Adapter: partial    |
| Deal    | `buildWinRateTrend` hardcodes month names `['May','Jun','Jul','Aug','Sep','Oct']` | Forecast: done      |

### 2.6 Event Pipeline Gaps

The matrix marks event-related features as `done` or `planned` but doesn't track
handler completeness:

| Entity  | Events Defined | Handlers Implemented                 | Gap                                       |
| ------- | -------------- | ------------------------------------ | ----------------------------------------- |
| Lead    | ~5 events      | 3 handlers                           | Missing: LeadScored, LeadMerged           |
| Contact | ~4 events      | 2 handlers                           | Missing: ContactMerged, ContactEnriched   |
| Account | 5 events       | **0 handlers**                       | Zero account event types in events worker |
| Deal    | 4 events       | **1 handler** (opportunity.won only) | Missing: created, stage_changed, lost     |

---

## Part 3: Entity-by-Entity Deep Cross-Reference

### Lead (Matrix: 7 features | Audit: 75 findings)

| Matrix Feature       | Matrix Status | Matrix Layers (weakest) | Audit Verdict               | Key Audit Findings                                                                              |
| -------------------- | ------------- | ----------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| Lead Entity & Domain | done          | All done                | **Accurate**                | Domain model sound; `LeadAssignment` model unused; `LeadSource` enum diverges between domain/DB |
| Lead Database Layer  | planned       | Database: done          | **Understated** — DB exists | Schema exists but 4 missing composite indexes for common queries                                |
| Lead Adapter Layer   | planned       | Adapter: partial        | **Roughly accurate**        | `findSimilar()` returns empty; tenant isolation present but `filterOptions` raw                 |
| Lead Router Layer    | planned       | Router: partial         | **Roughly accurate**        | 34 procedures built, zero audit logging, `filterOptions` uses raw `ctx.prisma`                  |
| Lead Frontend Pages  | planned       | Frontend: partial       | **Understated**             | Detail page functional (fixed 2026-03-04) but 12 no-op buttons, EmailCompose unwired            |
| Lead Tests           | planned       | —                       | **Understated**             | 620-line contract test exists but missing stage coverage; zero detail page tests                |
| Lead AI Integration  | planned       | —                       | **Roughly accurate**        | AI scoring wired (fixed 2026-03-04); Similar Leads returns `[]`                                 |

**Matrix accuracy: 3/7 accurate, 3/7 understated, 1/7 accurate**

### Contact (Matrix: 14 features | Audit: 79 findings)

| Matrix Feature                      | Matrix Status | Audit Verdict                 | Key Audit Findings                                                                 |
| ----------------------------------- | ------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| Account contacts panel              | done          | **Overstated**                | Panel renders but "Add Contact" buttons have no onClick handler                    |
| Contact 360                         | planned       | **Understated** — page exists | 26 wired / 6 partial / 24 not-wired; substantial functionality present             |
| Contact 360 Page - Full Detail View | done          | **Overstated**                | 79 findings within "done" page including 13 CRITICAL; 19 no-op buttons             |
| Contact activity timeline           | done          | **Partially accurate**        | Timeline renders but reaction/comment arrays hardcoded `[]`; action buttons no-ops |
| Contact filters                     | done          | **Accurate**                  | Filters functional                                                                 |
| Contact relationship view           | done          | **Accurate**                  | Works correctly                                                                    |
| Contact search                      | done          | **Accurate**                  | Search wired                                                                       |
| Contact tRPC Router                 | done          | **Overstated**                | Router exists but 3 procedures use raw `ctx.prisma`, zero audit logging            |
| Contacts List                       | planned       | **Understated**               | List page exists and mostly works; minor filter issues                             |
| Contacts Module                     | done          | **Partially accurate**        | CRUD works but edit form partially wired                                           |
| Edit Contact                        | planned       | **Understated**               | Edit form exists but partial                                                       |
| Import Contacts                     | planned       | **Understated**               | CSV import exists but no progress indicator; export is a stub                      |
| Merge Contacts                      | planned       | **Roughly accurate**          | `findDuplicates()` is a stub                                                       |
| Contact Activity Tracking           | planned       | **Accurate**                  | `lastContactedAt` not implemented                                                  |

**Matrix accuracy: 4/14 accurate, 4/14 overstated (marked done but has gaps),
5/14 understated (marked planned but exists), 1/14 partial**

### Account (Matrix: 7 features | Audit: 43 findings)

| Matrix Feature              | Matrix Status | Audit Verdict          | Key Audit Findings                                                            |
| --------------------------- | ------------- | ---------------------- | ----------------------------------------------------------------------------- |
| Account Detail              | planned       | **Understated**        | Best-wired detail page of all 4 entities — all 6 tabs use real API data       |
| Account hierarchy view      | done          | **Accurate**           | Fully wired with tree visualization, mutations work                           |
| Account opportunities panel | done          | **Partially accurate** | Panel renders but "Create Opportunity" buttons (×2) have no onClick           |
| Account revenue charts      | done          | **Accurate**           | Revenue charts wired to real data                                             |
| Accounts List               | planned       | **Understated**        | List page exists and works                                                    |
| Edit Account                | planned       | **Roughly accurate**   | No edit form exists; router silently drops revenue/employees/industry updates |
| Import Accounts             | planned       | **Accurate**           | Not built                                                                     |

**Matrix accuracy: 3/7 accurate, 2/7 understated, 1/7 partially accurate, 1/7
roughly accurate**

### Deal (Matrix: 33 features | Audit: 42 findings)

| Matrix Feature                                         | Matrix Status | Audit Verdict              | Key Audit Findings                                                                                                      |
| ------------------------------------------------------ | ------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Deal Forecasting & Reporting                           | done          | **Overstated**             | Forecast page works but `buildWinRateTrend` hardcodes months; stage probabilities diverge between validators and domain |
| Deal pipeline Kanban board                             | in_progress   | **Accurate**               | Kanban renders, drag-drop partially works                                                                               |
| Deal stage drag-drop                                   | in_progress   | **Accurate**               | Partially functional                                                                                                    |
| Deal/Opportunity tRPC Router                           | done          | **Overstated**             | 16 procedures exist but zero audit logging, name updates silently dropped, `CLOSED_LOST` passes empty reason            |
| Deals Pipeline - Kanban Board                          | done          | **Accurate**               | Pipeline board genuinely works                                                                                          |
| Edit Opportunity                                       | planned       | **Accurate**               | No edit form exists                                                                                                     |
| Opportunities List                                     | planned       | **Understated**            | List page exists and is well-wired via DealListView                                                                     |
| Opportunity Detail                                     | planned       | **CRITICALLY Understated** | Page exists but is 100% hardcoded with SAMPLE_DEAL — worse than not existing because users see fake data                |
| Pipeline Board                                         | planned       | **Understated**            | Pipeline board exists and works                                                                                         |
| Pipeline filtering                                     | in_progress   | **Partially accurate**     | Filter state captured but never passed to API query                                                                     |
| Pipeline Stage Customization                           | done          | **Accurate**               | Works via pipeline-config router                                                                                        |
| Pipeline Stages                                        | planned       | **Overstated**             | STAGES constant uses `CLOSED` instead of domain's `CLOSED_WON`/`CLOSED_LOST`                                            |
| Deal forecast history/probability/recommendations/risk | planned (×4)  | **Understated**            | Forecast sub-pages exist and partially work                                                                             |
| Deal Won/Lost Closure Workflow                         | planned (×2)  | **Accurate**               | Not implemented; entity layer partial                                                                                   |
| Quote/Order/Price Book features                        | planned (×8)  | **Accurate**               | CPQ not built                                                                                                           |
| Products/Product Detail                                | planned (×2)  | **Roughly accurate**       | `getProducts` endpoint exists but no UI wiring                                                                          |

**Matrix accuracy: ~10/33 accurate, 6/33 understated, 4/33 overstated, rest
roughly accurate or accurate-planned**

---

## Part 4: Structural Blind Spots

### Things the Feature Matrix Cannot Detect

| Category                    | Count               | Impact         | Recommendation                                                 |
| --------------------------- | ------------------- | -------------- | -------------------------------------------------------------- |
| **Cross-tenant data leaks** | 3 repos             | P0 security    | Add "Tenant Isolation" as a 7th layer column                   |
| **No-op UI buttons**        | 51 buttons          | UX dead-ends   | Add "Wiring Completeness" sub-status under Frontend            |
| **Zero audit logging**      | 4 routers           | Compliance gap | Add "Audit Coverage" as a quality gate                         |
| **Hardcoded sample data**   | 1 page (Deal)       | User deception | Frontend `done`/`partial` should require API call verification |
| **Dead code**               | 11 methods (Deal)   | Tech debt      | Not trackable in feature matrix (belongs in debt ledger)       |
| **Event handler gaps**      | 12 missing handlers | Async broken   | Add "Events" as a 7th layer, or sub-column of Adapter          |
| **Divergent constants**     | 3 sets              | Runtime bugs   | Not trackable (belongs in lint rules)                          |
| **Missing routes**          | 1 (/deals/new)      | 404 errors     | Frontend `partial` should require route existence check        |
| **Stub implementations**    | 4 methods           | False signals  | Adapter `done` should require non-empty return values          |

### Proposed Matrix Enhancements

1. **Split Frontend into Frontend-List and Frontend-Detail** — List pages are
   consistently better wired than detail pages. A single Frontend column masks
   this disparity.

2. **Add a "Wired" sub-status** — Within `done`, distinguish between
   `done-verified` (audit-confirmed) and `done-unverified`. The current `done`
   status is misleading when layers have CRITICAL bugs.

3. **Add an "Events" layer** — Event-driven architecture is core to the CRM but
   invisible in the current 6-layer model. Account has 5 defined events with 0
   handlers — this gap is invisible.

4. **Add a "Security" quality gate** — Tenant isolation, audit logging, and
   input sanitization are cross-cutting concerns that no single layer column
   captures.

---

## Part 5: Reconciliation Summary

### Features Where Matrix and Audit Agree

| Feature                          | Matrix  | Audit                      | Verdict |
| -------------------------------- | ------- | -------------------------- | ------- |
| Lead to Contact Conversion Logic | done    | Confirmed working          | Aligned |
| Contact filters                  | done    | Fully functional           | Aligned |
| Contact search                   | done    | Fully wired                | Aligned |
| Contact relationship view        | done    | Works correctly            | Aligned |
| Account hierarchy view           | done    | Fully wired with mutations | Aligned |
| Account revenue charts           | done    | Wired to real data         | Aligned |
| Deals Pipeline - Kanban Board    | done    | Genuinely functional       | Aligned |
| Pipeline Stage Customization     | done    | Works via config router    | Aligned |
| All CPQ features                 | planned | Not built                  | Aligned |

### Features Where Matrix and Audit Disagree

| Feature                   | Matrix Says               | Audit Says                               | Severity of Mismatch                 |
| ------------------------- | ------------------------- | ---------------------------------------- | ------------------------------------ |
| Opportunity Detail        | planned                   | **Page exists with 100% fake data**      | CRITICAL — users see fabricated data |
| Contact 360 Page          | done                      | **79 issues, 13 CRITICAL**               | HIGH — "done" is misleading          |
| Account Adapter Layer     | done (via hierarchy task) | **Zero tenant isolation**                | CRITICAL — security vulnerability    |
| Deal tRPC Router          | done                      | **Zero audit logging, silent data loss** | HIGH — compliance gap                |
| Contact activity timeline | done                      | **Reactions/comments hardcoded `[]`**    | MEDIUM — partial functionality       |
| Account contacts panel    | done                      | **"Add Contact" buttons non-functional** | MEDIUM — UX dead-end                 |
| Pipeline filtering        | in_progress               | **Filter state never sent to API**       | MEDIUM — wiring completely broken    |

### Overall Accuracy Rate

- **Aligned** (matrix status matches audit reality): ~25/61 (41%)
- **Understated** (matrix says planned, audit found existing work): ~15/61 (25%)
- **Overstated** (matrix says done, audit found defects): ~12/61 (20%)
- **Roughly accurate** (directionally correct, minor gaps): ~9/61 (14%)

The matrix is most accurate for features that are either genuinely complete
(backend-only conversions, search, filters) or genuinely not started (CPQ). It
is least accurate for features in the "middle ground" — where code exists but is
partially wired, has no-op buttons, or uses hardcoded data.

---

## Appendix: Audit Documents

| Entity    | Audit Document                              | Findings                     | Tasks              |
| --------- | ------------------------------------------- | ---------------------------- | ------------------ |
| Lead      | `docs/audit/lead-detail-wiring-audit.md`    | 75 (5C, 14H, 12M, 6L, 9T)    | IFC-216 to IFC-251 |
| Contact   | `docs/audit/contact-detail-wiring-audit.md` | 79 (13C, 22H, 22M, 12L, 10T) | IFC-252 to IFC-266 |
| Account   | `docs/audit/account-detail-wiring-audit.md` | 43 (7C, 12H, 10M, 9L, 5T)    | IFC-267 to IFC-277 |
| Deal      | `docs/audit/deal-detail-wiring-audit.md`    | 42 (5C, 11H, 12M, 10L, 4T)   | IFC-278 to IFC-287 |
| **Total** |                                             | **239**                      | **72 tasks**       |
