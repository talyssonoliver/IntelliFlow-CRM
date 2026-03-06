# Sprint 14 Completion Audit Report

**Run ID:** `sprint14-audit-20260302T192141-ssfv6h`
**Generated:** 02/03/2026, 19:22:10
**Duration:** 29.2 seconds
**Strict Mode:** No

## ❌ Overall Verdict: **FAIL**

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks in Sprint | 48 |
| Completed Tasks | 48 |
| Tasks Audited | 48 |
| ✅ Passed | 43 |
| ❌ Failed | 3 |
| ⚠️ Needs Human Review | 2 |

## Evidence Summary

| Category | Found | Issues |
|----------|-------|--------|
| Artifacts | 206 ✓ | 0 missing, 0 empty |
| Validations | 52 passed | 3 failed |
| KPIs | 0 met | 0 missed |
| Placeholders (in task artifacts) | - | 3 found |
| Placeholders (codebase total) | - | 451 found |

## ⛔ Blocking Issues

These issues must be resolved before sprint can be considered complete:

### 🔴 Critical
- **IFC-120**: Validation(s) failed: pnpm test:e2e
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-167**: Validation(s) failed: pnpm dev
  - *Recommendation:* Fix failing validations before marking complete
- **DOC-007**: Validation(s) failed: pnpm run lighthouse
  - *Recommendation:* Fix failing validations before marking complete

### 🟠 High
- **IFC-120**: 7 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-167**: 4 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete
- **DOC-007**: 4 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete

## Task Details

### ❌ Failed Tasks

#### ❌ IFC-120

**Description:** Implement password reset and email verification flows
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm test:e2e
- 7 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm test:e2e` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-167

**Description:** Wire workers to pnpm dev startup - Follow-up to IFC-163
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm dev
- 4 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm dev` (exit code: 1)

---

#### ❌ DOC-007

**Description:** Conduct full accessibility compliance gap assessment: Lighthouse a11y audit on all 27 URLs, document WCAG 2.1 AA conformance level per route, identify all Level A and AA failures, produce gap report with remediation priorities
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm run lighthouse
- 4 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm run lighthouse` (exit code: 1)

---

### ⚠️ Needs Human Review

#### ⚠️ PG-029

**Description:** Payment Methods
**Status:** Completed

**Issues:**
- Found 1 placeholder(s) in task artifacts
- 6 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders

**Placeholders Found:**
- `apps\web\src\app\billing\payment-methods\__tests__\page.test.tsx:21` - STUB: `PaymentMethods: () => <div data-testid="payment-me...`

---

#### ⚠️ PG-031

**Description:** Receipts
**Status:** Completed

**Issues:**
- Found 2 placeholder(s) in task artifacts
- 6 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders

**Placeholders Found:**
- `apps\web\src\lib\billing\receipt-emailer.ts:44` - SIMULATED_DATA: `* real API; omit it (or pass undefined) to fall ba...`
- `apps\web\src\lib\billing\receipt-emailer.ts:56` - SIMULATED_DATA: `* email delivery. When `sender` is omitted a synth...`

---

### ✅ Passed Tasks

<details>
<summary>Click to expand passed tasks</summary>

- **IFC-024**: PHASE-011: Human-in-the-Loop Feedback...
  - Artifacts: 2 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-045**: Integration Tests (Vitest + MSW)...
  - Artifacts: 5 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-061**: FLOW-006: Lead to Contact Conversion Logic...
  - Artifacts: 5 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-062**: FLOW-006: Lead to Deal Conversion Logic...
  - Artifacts: 4 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-063**: FLOW-007: Pipeline Stage Customization...
  - Artifacts: 5 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-064**: FLOW-007: Kanban Drag-Drop Persistence...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-065**: FLOW-009: Deal Won Closure Workflow...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-066**: FLOW-009: Deal Lost Closure Workflow...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-067**: FLOW-012: Automatic Ticket Routing Engine...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-068**: FLOW-015: Feedback Analytics Dashboard...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-069**: FLOW-020: Unified Activity Feed Service...
  - Artifacts: 4 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-086**: Model Versioning with Zep...
  - Artifacts: 10 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-088**: Continuous Quality Metrics...
  - Artifacts: 15 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **PG-025**: Billing Portal...
  - Artifacts: 4 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **PG-026**: Checkout...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **PG-027**: Invoices...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **PG-028**: Invoice Detail...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **PG-030**: Subscriptions...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **EXP-ARTIFACTS-002**: Cookie Consent Component Implementation (GDPR)...
  - Artifacts: 4 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **EXP-ARTIFACTS-003**: Vulnerability Baseline Documentation...
  - Artifacts: 2 verified
  - Validations: 0 passed
  - KPIs: 0/1 met
- **TRACK-001**: Status Snapshot UI - Real-time task status tracking with man...
  - Artifacts: 8 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **TRACK-002**: Quality Metrics UI - Debt ledger coverage SonarQube with ref...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **TRACK-003**: Risk Register UI - View and update risks with mitigation tra...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **TRACK-004**: AI Metrics UI - Model performance drift detection cost track...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **TRACK-005**: Security Dashboard UI - Vulnerability tracking scan results ...
  - Artifacts: 3 verified
  - Validations: 0 passed
  - KPIs: 0/2 met
- **TRACK-006**: Build Health UI - Validation results build status test resul...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **IFC-168**: Convert AI worker to BullMQ queue consumer - Follow-up to IF...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **IFC-174**: Run REAL Ollama benchmarks - Follow-up to IFC-085...
  - Artifacts: 4 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **PG-128**: FLOW-045: AI Chain Versioning Admin UI - Wire IFC-086 Backen...
  - Artifacts: 9 verified
  - Validations: 1 passed
  - KPIs: 0/6 met
- **PG-129**: Authenticated Home Page - Welcome summary activity feed AI i...
  - Artifacts: 7 verified
  - Validations: 1 passed
  - KPIs: 0/4 met
- **PG-130**: Notifications Inbox Page - List mark read real-time updates ...
  - Artifacts: 6 verified
  - Validations: 1 passed
  - KPIs: 0/4 met
- **PG-131**: Deal Forecast UI Pages - Probability gauge risk factors reco...
  - Artifacts: 9 verified
  - Validations: 1 passed
  - KPIs: 0/4 met
- **IFC-190**: Analytics tRPC Router - Sales metrics conversion funnels tim...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/4 met
- **PG-154**: Fix View Schedule 404 - Welcome Banner links to /calendar wh...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/1 met
- **PG-155**: Fix 6 broken Quick Action hrefs - /calls/new /emails/compose...
  - Artifacts: 2 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **PG-165**: Update PRD checkboxes for home page - mark completed accepta...
  - Artifacts: 1 verified
  - Validations: 2 passed
  - KPIs: 0/1 met
- **DOC-002**: Update sitemap.md to reflect actual 101 page.tsx files, add ...
  - Artifacts: 3 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **DOC-003**: Update PAGE_MAP_AND_FLOWS.md to reflect 103 pages and curren...
  - Artifacts: 1 verified
  - Validations: 1 passed
  - KPIs: 0/4 met
- **DOC-004**: Update ui-flow-mapping.md cross-reference matrix to 103 rout...
  - Artifacts: 1 verified
  - Validations: 1 passed
  - KPIs: 0/4 met
- **DOC-005**: Complete overhaul of page-registry.md from 8 routes to all 1...
  - Artifacts: 1 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **DOC-006**: Create unified IA reference combining reachability audit rou...
  - Artifacts: 1 verified
  - Validations: 1 passed
  - KPIs: 0/2 met
- **DOC-008**: Create VPAT 2.5 document, WCAG 2.1 AA conformance statement,...
  - Artifacts: 6 verified
  - Validations: 1 passed
  - KPIs: 0/4 met
- **DOC-009**: Create content audit framework and perform initial audit: qu...
  - Artifacts: 2 verified
  - Validations: 1 passed
  - KPIs: 0/6 met
</details>

## Artifact Hashes

SHA256 hashes for all verified artifacts:

```
48341850a27b968b485b02a38057e014808cf1d1071eb80e575b75d1c9b1f55c  artifacts/misc/feedback-analytics.json
f35d41f3d97d1d2d30b058eb7e97249125979d5d2d892417eefa8b766f320a8c  .specify/sprints/sprint-14/attestations/IFC-024/context_ack.json
a11cd75078aec4411cfc91e9269197cdf63c09d52d2371d34f6412a3afeb3cdd  apps/web/src/lib/test-runner/index.ts
74ca4b1cd48ed8c082727a685960a317d622b9eaf6f6741effa2cc484b964cec  apps/web/src/test/mocks/handlers.ts
774c941dc39052ddd2fdd3d8efedb50aaf0eccaa9776b3ef4a57b8e02a17a57d  apps/web/src/test/mocks/server.ts
e190ac4d1b4db1822600d153f7b4db374d401f7da4925ebfece6dc58ef37b31f  apps/web/src/app/governance/quality-reports/__tests__/integration.test.tsx
5696d8cf22b0849dd927163029c427025b4858117500b329c08e1aa35bd0dec2  .specify/sprints/sprint-14/attestations/IFC-045/context_ack.json
58620affc98f8dc72253fde575000539439a9f365dfca4437af8cdbe8f90bdc8  packages/application/src/usecases/leads/ConvertLeadToContactUseCase.ts
b61c6762cc8be755f16f1c78caf49178f945c2f83f50e61dee4200a52e628f06  packages/application/src/usecases/leads/__tests__/ConvertLeadToContactUseCase.test.ts
22916ba13b345461e4236b450107cdfbbcf8241375fade5ec4fd2ccde2d060ac  .specify/sprints/sprint-14/attestations/IFC-061/context_ack.json
95b48bd4fbff6a06f870be0ad248847d51b354705f6d89ea8d5ea1e2b27821fb  docs/planning/adr/ADR-019-core-crm-foundation.md
7b7dff301febbb7adfd0a53ba0a9cbf36c70da93758d9c77acb62a31a118c219  docs/planning/prd-core-crm.md
ded9fcf3a0ab31e7c927648ee8ad2ea1dd68bb1b10f55392c6a371463507db01  packages/application/src/usecases/leads/ConvertLeadToDealUseCase.ts
32c2446025e5af60931a1eb518910de6a47b092748e4e908588b43bd36fa8e88  packages/application/src/usecases/leads/__tests__/ConvertLeadToDealUseCase.test.ts
2aa9bf60ddf8d906c2fe593bd530449a3d0fbe0a5ceb3533f4615c4472cb8dda  apps/api/src/modules/lead/__tests__/lead.convertToDeal.router.test.ts
56a51b4cfd021fd6f25ca87aff45a7ff1f9d1acb599ae0d11437db26e547c9f5  .specify/sprints/sprint-14/attestations/IFC-062/context_ack.json
17fb173fa7f60ea712e9c3b6b9b3cd4cae7a972564691a6e2773cb6c74254a35  apps/api/src/modules/opportunity/pipeline-config.router.ts
9724440d84323d3fc0214219382c41fb7b0f5a6b8ca1f275ce16c483d1c59020  apps/web/src/app/settings/pipeline/page.tsx
53ceade741d8622dc1fa624e93f52b568fae70839241512044cfdb24f1a754ce  .specify/sprints/sprint-14/attestations/IFC-063/context_ack.json
c46e8f7086f592854fcb2ed64aa898d7efcb19a57366436fcdd494ff6ec61273  apps/web/src/components/deals/PipelineBoard.tsx
a9ecace16bfced506b894aa8391342a2898707598617a4fd1f5894cc3f24a3ef  apps/web/src/components/deals/LossReasonModal.tsx
5a0ee5b157a532cc1a5203b3bf746c38e2449968eb8ce9cb7df6f9dabd8aa840  .specify/sprints/sprint-14/attestations/IFC-064/context_ack.json
2b28a0751a96e840a5f5adfb779923c241de8f043f80299fef0c7389b93dc3bc  packages/application/src/usecases/deals/CloseDealWonUseCase.ts
922cba7126f4e88918c9aef04d1fbd9f5baa2ec41867be6333f5d11161ab96fb  packages/domain/src/crm/opportunity/OpportunityEvents.ts
5b98c82fcaadb3139580b191e06a01e5c86c04192822e8118a80f587a9a2e3b2  .specify/sprints/sprint-14/attestations/IFC-065/context_ack.json
590c83963f219c91cd5081571548b76bbbe65976b303f85e231736809584e054  packages/application/src/usecases/deals/CloseDealLostUseCase.ts
395cc0d5fa163d88628cd8b42c0c594a751294442e9c2be10a8106b53fe51437  .specify/sprints/sprint-14/attestations/IFC-066/context_ack.json
9c48fe0ff21fc673fcf7b6548ab0c299ff04139a010f933ce107638d68106b7b  apps/ai-worker/src/chains/ticket-routing.chain.ts
1da10f92b1cd4a4ac6198c73e9d62659f7043ed17a43e40848449f66ceba5314  apps/api/src/modules/ticket/__tests__/routing.test.ts
0784c08ccb406969c7619d2538f5f90b1e4e0926ff82b6507a26ee0ecaf0f7be  .specify/sprints/sprint-14/attestations/IFC-067/context_ack.json
9e55a9c7391544f4d89d5a0b9861aa488628340dbd1ac0c0982bb2eadfeeae0c  apps/web/src/app/analytics/(list)/feedback/page.tsx
2ba94caa96e08eadf14b5e04b382c60bbdd9682deef26dca8c8ec6b31de8f654  apps/api/src/modules/feedback/feedbackSurvey.router.ts
b2f4958e7fb8398caebfd9b5a096f4b4dac594a300bc36570681e5f459fb4660  .specify/sprints/sprint-14/attestations/IFC-068/attestation.json
0bb6b337c4e2b10dce21b736d27b62f1bb4f36d15508a1283651381bc39d6f12  apps/api/src/modules/misc/activity-feed.router.ts
1640381f1f72b9c0f93c4f2bfdb1e60b22ffc1c2559a2e0b50f517c3e69876cb  apps/web/src/components/shared/activity-feed/ActivityFeed.tsx
ff001dff041e747a41a7851ac777cd386b27b95a2ad77aa6a48327d7d851d571  packages/application/src/services/ActivityFeedService.ts
b70b4e5ae8991636dcdcec4266eafcd08c16563212b7ff2953a757db6cd082cc  .specify/sprints/sprint-14/attestations/IFC-069/attestation.json
3fc98b26078808c55c49681fe7db7b65e94ecd08d2af2d9dc5b4b3f163018fb4  packages/domain/src/ai/ChainVersionConstants.ts
f26a9d4873ffff7aea0cd7b733014c8ad83bc45ea8a62a263ba8c6b560c610cb  packages/validators/src/chain-version.ts
cae80331fe69de8187bcb5c0a2edfa6ae31e8a41166a9f0fd25e8839c8cdbc94  packages/application/src/services/ChainVersionService.ts
ed08dbb529e37033cc2acbc4676dd97f317475349f7ce148082cd368ba336e97  apps/ai-worker/src/versioning/version-loader.ts
051d181e24998fa674bc3ff8ce5537e58f3826b1d2759096f99a1dc6295ce803  apps/api/src/modules/chain-version/chain-version.router.ts
7d88490c79f706bc3d1fef41fc79da83f5fd5f579fcdeecf0ea54f6e1e31781d  artifacts/misc/prompt-versions/prompt-versions-latest.json
261fe4bf14ba9248e80a5b8f435efa06c521a949177ff5501205d5e8088136c6  artifacts/misc/ab-test-config.yaml
73a2e81e68836472e3b0b4f92efc86ba8ffe374bce6e61ca8e1872f74010f748  .specify/sprints/sprint-14/attestations/IFC-086/context_ack.json
483986ee8024d71697f507aa567e9980d91bda8192ac4a7453845b3e7fff2cba  docs/planning/adr/ADR-022-ai-features-quality.md
85d8eaa5107ea51d87790fcac72bd683d145d893aa7d91408bbd359c861912e0  docs/planning/prd-ai-output-quality.md
f50254e1266c72662bc60efd59e1b6ce4a55854f6bbf9b7d796d829ff4f2ee7d  artifacts/misc/sonar-project.properties
ace8d93d9887caea60865ebe6f247c0d78dacc5c75bc17c82b16a89e0474cc9d  artifacts/misc/quality-gate-config.json
3861a4e806ccdfd5589bfd3d18cb12815d3bf7aaa652154a7c215953ec38bef9  artifacts/reports/sonarqube-debt-report.html
2a89d18bbb6088f215700b8989f8333b270632cd23cd4d63a42db430db81ccc6  docs/shared/refactoring-backlog.md
d3720d1999ecfedb25e7009122299932ae33b2b9f39ced91183fbd2dd85f229c  scripts/sonar-iterative.js
295d2d3dca7bda0f85eceec2d86dfddde378b6a61ac1dff954b91129c54bc5b7  scripts/sonar-new-issues.js
a943fd3b765945b4efd48bf2f96c4ab3fbd3d3fa4bef543dc173de99e755afda  scripts/sonar-report-generator.js
8382e0bed5a39d6d8b89899bfcbaedf7c15246cc291a2ca165b7907e29edb80a  scripts/sonar-scan.js
003c794245da33e90a4a9bc1ec10f2de381da826c0e769a19a8bcc3e9373444c  scripts/sonar-set-new-code-baseline.js
03f385b5cc13f78f99c84369fff5f74a739752f4732ea36b6bc97f72b5adaeff  scripts/sonar-status.js
6161be41fcd10effb0b8dfe2a007b889f7acb13a0bade521cb21544b7cba49b9  scripts/sonar-tracker.js
5df49f0f8fa672b0b05dc2f4524e62c27344c57b8ccfe7028d3de304f15fe272  scripts/sonarqube-helper.js
aeea2ce077e222e11846614b80faf0708521bbd9d03a0e1b8109aa3acfb3b264  scripts/setup-quality-tools.sh
983a162443e77204429f3cc486e88506e220ab7156ba61164767855854321399  scripts/pnpm-audit-report.js
95cca96edc37b153c8034a24ab5fdad3a2c5006d8777d0cc9685dffb98159d1f  .specify/sprints/sprint-14/attestations/IFC-088/context_ack.json
379fbd9eb77f988278ba52408b5d348f8ecc92d203d75037221b75e777dd635f  apps/web/src/app/billing/page.tsx
be3b2cee8cf16d87cf0a8516ef7f630f9364a707fb8019e352fed6715bef92db  apps/web/src/components/billing/billing-portal.tsx
25415eb5f2b106abf731afeeede1c3017b1d9d0890dcf8bcaf1becb1dd48f050  apps/web/src/lib/billing/stripe-portal.ts
4b7878ae9ed8564bd996a977daaca0b5ab030bb22defbd39a194d823268a9054  .specify/sprints/sprint-14/attestations/PG-025/context_ack.json
25b78ff37ecc7e7b017258526900350d4f373505b57e8d0fd4cbe6115134f1b5  apps/web/src/app/billing/checkout/page.tsx
013505bdd3704c04232cb6025967060b4111253d6ed03b6c061d6af0c02b9ab6  apps/web/src/components/billing/checkout-form.tsx
b23c522d5faa101cedd1a69751a4eafc9c2d94c8d4fed77842cf090aea58cf65  apps/web/src/lib/billing/payment-processor.ts
554880932654eb180b9c998d0b996e2670c7ecc7869b054aa4281a45c1531f35  .specify/sprints/sprint-14/attestations/PG-026/context_ack.json
7515bc58f8c309ee36f64107c0b6536aaa66d5bfb1dc45e72c3ef21fdb33cda6  apps/web/src/app/billing/invoices/page.tsx
427806715dd331f9713e16a751b734e927eb873d76f7c3727a295a4acd01871b  apps/web/src/components/billing/invoice-list.tsx
55837deb9205c89395b7306621bc2ee0ae185a0bbed02806ed0c7f4a7cafc016  apps/web/src/lib/billing/pdf-generator.ts
6b22bf33ff1718bdbf593dacaa50f6067e6557f4b816d7c18f211b5e60564300  .specify/sprints/sprint-14/attestations/PG-027/context_ack.json
19ad851ca8d2961419c15b6c8fd75e4919162b6042fbffc791f3af1de7dfe9b3  apps/web/src/app/billing/invoices/[id]/page.tsx
b702556984e6b7b812b746fa4c548299c4e2218ba1400f17a635d0f12671571d  apps/web/src/components/billing/invoice-detail.tsx
c7c8d26b2ebb3c9fb7ebedfcf607d650bf915d6f122c0465e8a0466dd29f179a  apps/web/src/lib/billing/invoice-actions.ts
df9cbe42aec680dca986b566ec61f857bca646c4b8ac5ad14661b0575c408a53  .specify/sprints/sprint-14/attestations/PG-028/context_ack.json
877f3c12e969b8e9a1c889e1c41ac1ab9c0a75591e1f82e919e1aa278106f564  apps/web/src/app/billing/payment-methods/page.tsx
39026711603964daeb7ae425c3b5c85152a07f5dc185d144fe171ee01c51a146  apps/web/src/components/billing/payment-methods.tsx
963e23a56eadb412020f11fbfaf1927a9650f7d6d183b401a816804d888db234  apps/web/src/lib/billing/card-manager.ts
ba0e8ca189a55784bb77312daf90e3a0ccc47909493e775f62845ffdbe13f6f7  apps/web/src/components/billing/__tests__/payment-methods.test.tsx
f39d39ed3ed1502aeae912956c1600dcbd18aa873a35598556b6f554411e1bae  apps/web/src/components/billing/__tests__/payment-methods.supplementary.test.tsx
0659025c29d0b7be8b3a1d3cea48cd1e5bad4b8e9ccaf3c6fe0735560701b756  apps/web/src/app/billing/payment-methods/__tests__/page.test.tsx
9831fc51f38ffad8b763ae91e5d8e1334fc9e8931d1dbdd908698cf06290b75d  apps/web/src/components/billing/index.ts
c4008896e8e5fde6322a427a68e7bebcdcd46c834fefc4d6d16d1535eace07ac  packages/adapters/src/payments/stripe/types.ts
b9da885b1988b458b7131c8ec75d58096c6e5ccdcb5384b2c9a0bf0ac7d63ae0  packages/adapters/src/payments/stripe/handlers/customers.ts
535f8bb796f8ca16985853cee38441eba10e3ae3c9e8081429254ea5c998cada  apps/api/src/modules/billing/billing.router.ts
793cc9aeab1d9da8dba8fcda8c0843fed9304299a80751aea91ca3f604690157  apps/api/src/modules/billing/__tests__/billing.router.test.ts
ffdda017a10d1d25b460690be974915a6cb5541d2242c9e87a8446754740aab5  .specify/sprints/sprint-14/attestations/PG-029/context_ack.json
8221029e9625ad8e25d487383cd575dfd4ba29929a29cbaf95f8e517a54b93b0  apps/web/src/app/billing/subscriptions/page.tsx
1cff7678d34c6f35ee382168b91279be5ddcca419607350a3025a32ab384e441  apps/web/src/components/billing/subscription-manager.tsx
849711e1908cb4fb593066c0d58a8a0d3f5a9c66000a32bf798d334dbbb27b08  apps/web/src/lib/billing/plan-changes.ts
e438756143b6662d6feecc909e2e00463b09011ceff9c9e3d839cec22c01c7d6  .specify/sprints/sprint-14/attestations/PG-030/context_ack.json
9f07adc06c51f62e9770598b8714ffae75a5c8f5dbecd5385ae1d1a42cf51d2d  apps/web/src/app/billing/receipts/page.tsx
017074705c06a35398c5f1c75a5b4dbd64ea6a0ed21942aee093092757aaa84f  apps/web/src/components/billing/receipt-list.tsx
1fa563c5e8afa5367c55d04b135d675eaad1bccdc11dbe3d644afa3b238cf171  apps/web/src/lib/billing/receipt-emailer.ts
4df2e29fcf62a06236a0f0d399ef015a31789a33cc410a8e6d7837271ebf9779  .specify/sprints/sprint-14/attestations/PG-031/context_ack.json
201b48927236a2cdc3eb3cd8b4f943a5f13c976ef39a8cf0b9ec24cfc49fb37b  apps/api/src/modules/auth/auth.router.ts
7c7ae68fe65ea3f15cae06fb535574b468c2d16d61abfcbf20ed4bb2363f1147  packages/validators/src/auth.ts
4cf216fc73e3223ee5676565f0b39a9e8dbfe29d162ec001dac3f274700ecb9c  apps/api/src/lib/supabase.ts
b25b4528f78c3ed45ab12c128848df921de825e01b43eba989a0b0a1b79f7012  apps/web/src/app/(public)/reset-password/callback/page.tsx
5ea4e451787ebc3329d67e91ebe3508810c0deffc8b40cb8df6712a97bbac698  apps/web/src/app/(public)/verify-email/callback/page.tsx
ad5651bee8436829f04781b8d5a1cb187ddaceb582f856cb8895847470981c20  apps/web/src/components/shared/email-verification.tsx
e42ba8abfa2dc769b6a03545d22ffccdc2d526e43416662d54bfc2788e8c9e51  apps/web/src/components/shared/password-reset.tsx
51f573c5e273844b24d3ef11eebf9a7b0597ea9ec11abac9d37776f37a3be2a2  .specify/sprints/sprint-14/attestations/IFC-120/context_ack.json
1034977c268c2724c6e3053c873a859fc2216756b3ee4ca61815119ce3d0ba16  packages/ui/src/components/cookie-consent/cookie-consent.tsx
7a91e509e3ae5b54206cb1bf552fd309a82d36ba4cb842d9156cac0f6d3e4d46  packages/ui/__tests__/cookie-consent.test.tsx
837ec4f2a467028e987903cb1f7ef2bfbe50ae477d87b67cb880cae88c5b37e7  apps/web/src/app/layout.tsx
ab63c2b0be522007234571d0f770f49ef87006e7928f15d0837935d27c1ee65a  .specify/sprints/sprint-14/attestations/EXP-ARTIFACTS-002/context_ack.json
7330b583a433f1cdea1139e8312c5ff46253345dec5a55ec056e285988d04135  artifacts/misc/vulnerability-baseline.json
863082eaf0925f395fb61c4be6e5ec620bb351e54655160bbc4a0394daa6d1ab  .specify/sprints/sprint-14/attestations/EXP-ARTIFACTS-003/context_ack.json
8adb28d786de5fbbc0953a73b5fa40cae79be4099d1b37d5abd00a124bb16d16  apps/project-tracker/components/tracking/StatusTracker.tsx
c66220b2a7445fcb363dee10f32f26c0e9762724886c592fcbb76644a9ef54fd  apps/project-tracker/app/api/tracking/status/route.ts
2630977fa58f2fb5bc87d18d44b64af2c7f66d1f4a0adefd58f4bd53aa8e4d71  apps/project-tracker/components/tracking/shared/StaleIndicator.tsx
2335ba756818149bae9213160de4c2d7d738312bd6cbeefc2007181216e21fc9  apps/project-tracker/components/tracking/shared/RefreshButton.tsx
6f63c67ac182a40c951cb73220b0965ccaf2f4ec194c642d4e3dbc038fe07336  apps/project-tracker/components/TrackingView.tsx
0fbd1da9d99b8f802d351f79073e593259bdec191844539c505d268db2b638d0  apps/project-tracker/components/tracking/StatusHistory.tsx
4f60f2e916c173355c374e048410d433e07ac41ab1ac60cd5ffa62dbb6c14beb  apps/project-tracker/components/tracking/index.ts
1535bdfff0a023c5c02fee8f21f4ca1cf0bd7df0c8b551c3bf09aceb4531e8a4  .specify/sprints/sprint-14/attestations/TRACK-001/context_ack.json
0fdf1acc8a86c2d82de9e77f962457530b9c0df7b0cbd30196ca251b28c5379f  apps/project-tracker/components/tracking/QualityDashboard.tsx
e88ec9f4d059427146687e02491784bc9d438a3f09914429e8a1593d1d31758f  apps/project-tracker/app/api/tracking/quality/route.ts
78d616d682b11923e1466bef7e358ffa7ece06f4941122e6d7118e5f7b4a7dd4  .specify/sprints/sprint-14/attestations/TRACK-002/context_ack.json
c0a0ffa3851c55c3aa3df0f165da1f3d569c6fcb8f329b5727869eecf0ae5d01  apps/project-tracker/components/tracking/RiskRegister.tsx
a715da91f8e3f2962106b6535ed4f510fbce7288bd0cd4d59f1696681fb884e0  apps/project-tracker/app/api/tracking/risks/route.ts
df882900822caf6613053b6f32ab092d962c07762d0c42f4c2e8b67971008fff  .specify/sprints/sprint-14/attestations/TRACK-003/context_ack.json
c6bcff0378a84a3674ca069a48ef9cc4bba313f4cf5f724d626c99b3dc9ef061  apps/project-tracker/components/tracking/AIMetrics.tsx
948478fea1969f1c28a477876b2b3d23df6f9ebe5714a2162527494d156a6a79  apps/project-tracker/app/api/tracking/ai/route.ts
f3a88170e2a452e6d00b985b31f47ed0406878da96145a29439461c32d7983a1  .specify/sprints/sprint-14/attestations/TRACK-004/context_ack.json
9c77af147d1d58ccb46805749637997a0e892cab95364449652afbda06ba4f9d  apps/project-tracker/components/tracking/SecurityDashboard.tsx
7549557ccff58242f71ce7e601cc9cd5ebed33ff36ff7179ca19e4437d8d6fab  apps/project-tracker/app/api/tracking/security/route.ts
0b118db8b04ab80f6528463b78ea69d55e86821be3886735364fc1139934c09b  .specify/sprints/sprint-14/attestations/TRACK-005/context_ack.json
6724c4c02d71b1cdb53f4c046cc3cb8d8be9152de024dcedacd6b48ca3d66435  apps/project-tracker/components/tracking/BuildHealth.tsx
e26f72eb4605b807e4a5ad11d647c1c3e6bf09da029a9e8c29203dc8ac5efcda  apps/project-tracker/app/api/tracking/build/route.ts
42fd54af09fd579f2b10f1447264fd83c063c31d7da86b08fb97745edc1b064f  .specify/sprints/sprint-14/attestations/TRACK-006/attestation.json
e5149053d8f514aece5acde6fb9ce432234fbcdf96ffcdb278e83ddac21c8c56  package.json
64bbd3cfb225761afb498e0de355cbe7401a6aae02fa4cef9215de0bc7a31ce8  turbo.json
9978c630e45ac29e402ae89d72c07964a86c1977e20f2a76e0a51781b9724016  .specify/sprints/sprint-14/attestations/IFC-167/context_ack.json
63c8e61c63890e1cd6a3de10ca42bf5a424077aff38c0106eccfb9254b1e9aef  apps/ai-worker/src/index.ts
cc1ff0b99e41e0c62ac7477cc69a63053a584e72fb0bab465a5a99ad504649a0  apps/ai-worker/src/jobs/scoring.job.ts
80c2073438907d865a07f33b5627002b523f56f822ca1726447044bd4ce7932b  apps/ai-worker/src/jobs/prediction.job.ts
e93f01e4e2284e0245e83f22d4441ca07822b60539cbddd322b9058412527a29  .specify/sprints/sprint-14/attestations/IFC-168/context_ack.json
d0bc5be80585a1d53914526be46323cc45798a4c3fe9c1514103005a271d8c1c  artifacts/benchmarks/accuracy-benchmarks.json
c61d39756cbe86035b1fe67c6a4b2b01b1d5baee655798f63905eaf1df0a86a3  artifacts/reports/ollama-real-benchmark-report.json
64a9e36a9fcff0d750d2639aafffa1214f71ce74bd9e23e435445f088acfb198  scripts/run-ollama-benchmark.ts
ee307ad438f31d575cf24fca529f20309357e9617718c6e5e460edb1ddebbe9b  .specify/sprints/sprint-14/attestations/IFC-174/context_ack.json
a0718a67d0638d7c3f30e511025f2d24ca19bbbbb73168f8280ead852b927af6  apps/web/src/app/settings/ai/page.tsx
a2787e823b192bcda1776002fe4a95eee210ca7d17c4ade8912f505d237aca45  apps/web/src/app/settings/ai/components/ChainVersionsDashboard.tsx
0f3470bd4c0b118c87aaec1ceac24b53218ca2245b42955fc70882b3198ec49c  apps/web/src/app/settings/ai/components/ChainVersionsTable.tsx
e42ed37fabb543fa2fbef6f365dc41e75983f54af7f268a3e00eda57ae53a059  apps/web/src/app/settings/ai/components/ChainVersionEditor.tsx
c18924cdcf3fe6851ba3d6dfa18e6a709eb64b588eecbe4fdb6bcda5fa0905a5  apps/web/src/app/settings/ai/components/VersionComparisonView.tsx
f796daf2b118779b9bce8ff22eafd83280c02bd5a1c3343102cc8c4d304372f9  apps/web/src/app/settings/ai/components/ZepBudgetGauge.tsx
fba96b30dfebb533316853ba7bc6bd40379935ea1ab093e26e57d7c94564aeae  apps/web/src/app/settings/ai/components/VersionAuditLog.tsx
78d97dc73131d632cca613a61c86e1c8330faaee90a6e4bf26dc472f6e11ca84  apps/web/src/app/settings/ai/hooks/useChainVersions.ts
af50162ba45986571fcc6fa052d7d9c95fd483fe36b2ff7fa35f9ee16757fc9d  .specify/sprints/sprint-14/attestations/PG-128/context_ack.json
66f0a39abcba8063f2a7dfca56f37ddfd0fc09f1a9607590be4b777e2394044d  apps/web/src/app/(public)/page.tsx
b2a1271d8d7b0880e19f61a840dc82ff4231e03f8d2dbf5f2a328d2b620f992a  apps/web/src/components/home/AuthenticatedHomePage.tsx
9c70e202bf3f921e4d2ddfee715dd82a01231f51139f846379e8cf5651d9607e  apps/web/src/components/home/PublicHomePage.tsx
ed5c8906883fbb8a065d79a480eec87707a86f35e76175ad9b260d3ba72dc7b5  apps/web/src/components/home/HomePageContent.tsx
f9d2090dbc45f355f99802528dd429a51d8cbdabd9a3f52ded99b7491120d6c0  docs/planning/prd-home-page.md
6d9a466095112d2edf916bc0e37c9178e89bc105e0f6d0bbceac0637b1f869ee  docs/specs/HOME-PAGE-SPEC.md
57a7a6f0f4e7c15a7ad58bff8c95346b4a7cc59d02c2f3519ca7de1247d0de3d  .specify/sprints/sprint-14/attestations/PG-129/context_ack.json
bfec471fc3ca10fe73d9e429f1cf94871ce0fb9e760ba4c02e9de4cc7d31f7bc  apps/web/src/app/notifications/page.tsx
608ced3666046edba81d7033023682218e207e948c10208feaa70e3524a6c582  apps/web/src/components/notifications/NotificationList.tsx
c9a2a23e6308ffdda543af333ea7ebbf0ae96ed9c571d06ce32332b4b89265b4  apps/web/src/components/notifications/NotificationItem.tsx
3161c547f669502e83c30ccf749c2c5c3eb2adf7a10e521f3536a70959c708a2  apps/web/src/components/notifications/NotificationFilters.tsx
e99848b6b6a0487897c3c666f1f59cf57118a820301cf9d09fc4c0702f5a23e3  apps/web/src/components/notifications/NotificationBell.tsx
71b76f525c4f10eefa53de2638736d3bdc082753cbd24c13ee8e20434436010d  .specify/sprints/sprint-14/attestations/PG-130/context_ack.json
b9ac9d4bc563def7bf0031c5f73b377eba3aba1388c249bce8537d4a0dd8e054  apps/web/src/app/deals/[id]/forecast/page.tsx
5dd118208f46b91e33ed9ba159de7e9b45dcf84b076a79e6ae9558d172487f1e  apps/web/src/app/deals/forecast/page.tsx
ec9776096d060fb73e4c1a58cfe878733da3c2f68179f4334d7712c7c0e2b1dc  apps/web/src/components/deals/forecast/ForecastHeader.tsx
5ff675510d84212b50e96db3dbbc3b995026666c31bfca6a795f326ffefd959f  apps/web/src/components/deals/forecast/ProbabilityGauge.tsx
46a5592c664817cf13dd5156d2dd6b99a70142e8773e90081b84568b8e0dc9ba  apps/web/src/components/deals/forecast/RiskFactorsCard.tsx
3d8a5e45f0b934181d08bbbfd1b5899ef918a632f34560d638bbacc78bd0fb8d  apps/web/src/components/deals/forecast/RecommendedActions.tsx
92e53c561695ced478a65310665afeb2cb4d5e45fa2fb1956737cb3a3065ebcb  apps/web/src/components/deals/forecast/ForecastHistory.tsx
1d406bd10b239780a0a6b3e0cfa7a80bbc2d3934fc76f8ab56cba11a5a0cf19d  apps/web/src/components/deals/forecast/ConfidenceIndicator.tsx
ac377c127918af732e8a33ef7fab4ed2dac039905b5ac31999054c0bb96448cf  .specify/sprints/sprint-14/attestations/PG-131/context_ack.json
5a8d857d65ca3af5bace01a52bc068f5317d7c4fafecbbc5ed3da63666ef8a40  apps/api/src/modules/analytics/analytics.router.ts
9d0eacccfa011b96098b82fb27441da77292713e442fa33a45bb4f029f9ed907  apps/api/src/modules/analytics/__tests__/analytics.router.test.ts
21211de55565243c227145d654ea6f7e68213cb962d6f791a156df95a61e0491  .specify/sprints/sprint-14/attestations/IFC-190/context_ack.json
cb6f5d108aacf3b7044b78e300c1de33616e935ffdd54313abbf1c0bcdfb6aa3  apps/web/src/app/calendar/(list)/__tests__/page.test.tsx
40bdee3860adc53397544bca40e60684083f5817cb988d8e759ef76a3b93f7aa  apps/web/src/__tests__/root-proxy.test.ts
f576e4cd6985abbb428b02a20ec99699bdf366c0db09c996158047858997e2b7  .specify/sprints/sprint-14/attestations/PG-154/attestation.json
14a508bce7b32027cc3a0d0483a9eae8a8dd0b15149813dedd93a6ac5a26c42e  apps/web/src/components/home/PinnedItemsSheet.tsx
81d81b701a509024ba78865340be8fd23e5b37154e1738d2126f27269a003d90  docs/design/sitemap.md
eb1d66a48b6dc760ee9404043ea08d1141064af8bc1a305f25f98aece5c791a5  apps/web/src/app/sitemap.ts
b7d52d8716d1e02491b8a7dd8eb6b4cc64a9e1c0841e57d73de05085feb45328  apps/web/src/app/robots.ts
f78cca87d39e3a378b7a4b84a197bb2106cad0b0626767d8ba3f8a7dabfbe6a1  docs/design/PAGE_MAP_AND_FLOWS.md
a3fee911c72c194ba5eb9620edd4e5edc4cc76706dff59ff447dd06ce5b0516f  docs/design/ui-flow-mapping.md
f472a06e44eb8b5da4d59004b6289799fddf631aae9bf5be8b1dd155174e88db  docs/design/page-registry.md
6963751a2fbb2015a290e8504da474b6e94b59c2cf8eafc2927e408f1f73fc2d  docs/design/information-architecture.md
46d64f4ae5959efd707bec749b0aeeddcbe3099dfd0f6995dbaadfc788dc68ce  docs/compliance/accessibility-gap-assessment.md
dc5c108c21e472d3e2c5c674701fd1a421632e7036a70165cead597c23b6b728  artifacts/reports/accessibility-audit-results.json
046ef699a37e2d1036e4d4fac7bd0d34d62749d19136c62d09f4237d65efc218  docs/compliance/vpat-2.5.md
e3c02681c971e684e334a3465392a414ab40b710b728267f86c8cd7aea4fc6d6  docs/compliance/wcag-conformance-statement.md
9b8d3f35230829d21a62bbfe8e30eb3150511e7b6a6af6baa44d75ea99eb5181  tests/a11y/axe-core.spec.ts
2cc3ea5aa34b4af12b9a7fe4ccf4c5458f8ba1ae34ab2c73c858baa4d7b387a2  tests/a11y/vitest.config.ts
53d5498a4d6c5ed7e3223c42fcd98cf777ebbbc32ef78c7fcf4ddc7ad3802fda  tests/a11y/setup.ts
b52cae834e2e4357cb089ef554c15307bfeb6291d8d3f3d3ed7bd426907d27bc  docs/planning/adr/ADR-038-accessibility-architecture.md
b9a186692c76bd3de0479243330cca8be0e799056fe55c635bfeb31c92270bbb  docs/design/content-audit.md
4d1f5fce07b84770e3846f0de282e6fdae8493244c6a514225dd7e0bf25fd406  artifacts/reports/content-audit-results.json
```

---

*Generated by sprint-completion-auditor at 2026-03-02T19:22:10.681Z*