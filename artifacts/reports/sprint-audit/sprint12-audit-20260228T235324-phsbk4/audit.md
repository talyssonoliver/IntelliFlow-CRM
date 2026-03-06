# Sprint 12 Completion Audit Report

**Run ID:** `sprint12-audit-20260228T235324-phsbk4`
**Generated:** 28/02/2026, 23:53:34
**Duration:** 9.8 seconds
**Strict Mode:** No

## ❌ Overall Verdict: **FAIL**

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks in Sprint | 13 |
| Completed Tasks | 13 |
| Tasks Audited | 13 |
| ✅ Passed | 7 |
| ❌ Failed | 5 |
| ⚠️ Needs Human Review | 1 |

## Evidence Summary

| Category | Found | Issues |
|----------|-------|--------|
| Artifacts | 87 ✓ | 0 missing, 0 empty |
| Validations | 0 passed | 5 failed |
| KPIs | 0 met | 0 missed |
| Placeholders (in task artifacts) | - | 1 found |
| Placeholders (codebase total) | - | 1196 found |

## ⛔ Blocking Issues

These issues must be resolved before sprint can be considered complete:

### 🔴 Critical
- **IFC-081**: Validation(s) failed: pnpm test
  - *Recommendation:* Fix failing validations before marking complete
- **PG-013**: Validation(s) failed: pnpm test
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-169**: Validation(s) failed: pnpm test
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-170**: Validation(s) failed: pnpm test
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-171**: Validation(s) failed: pnpm test
  - *Recommendation:* Fix failing validations before marking complete

### 🟠 High
- **IFC-081**: 6 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete
- **PG-013**: 7 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-169**: 4 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-170**: 5 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-171**: 5 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete

## Task Details

### ❌ Failed Tasks

#### ❌ IFC-081

**Description:** API Documentation (tRPC + OpenAPI)
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm test
- 6 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ PG-013

**Description:** Landing Page Template
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm test
- 7 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-169

**Description:** Require Supabase env vars - Follow-up to IFC-006
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm test
- 4 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-170

**Description:** Implement Twilio SMS channel - Follow-up to IFC-157
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm test
- 5 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-171

**Description:** Implement webhook notification channel - Follow-up to IFC-157
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm test
- 5 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

### ⚠️ Needs Human Review

#### ⚠️ PG-014

**Description:** Status Page
**Status:** Completed

**Issues:**
- Found 1 placeholder(s) in task artifacts
- 6 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders

**Placeholders Found:**
- `apps\web\lib\status\incident-tracker.ts:302` - PLACEHOLDER: `// Until then, returns a conservative 99.9% estima...`

---

### ✅ Passed Tasks

<details>
<summary>Click to expand passed tasks</summary>

- **IFC-042**: tRPC API Client SDK Docs...
  - Artifacts: 6 verified
  - Validations: 0 passed
  - KPIs: 0/2 met
- **PG-009**: Blog Index...
  - Artifacts: 6 verified
  - Validations: 0 passed
  - KPIs: 0/3 met
- **PG-010**: Blog Post...
  - Artifacts: 6 verified
  - Validations: 0 passed
  - KPIs: 0/3 met
- **PG-011**: Careers Page...
  - Artifacts: 7 verified
  - Validations: 0 passed
  - KPIs: 0/3 met
- **PG-012**: Career Detail...
  - Artifacts: 4 verified
  - Validations: 0 passed
  - KPIs: 0/3 met
- **EXP-PLATFORM-001**: Platform utilities package - feature flags, resilience patte...
  - Artifacts: 24 verified
  - Validations: 0 passed
  - KPIs: 0/3 met
- **EXP-SCRIPTS-001**: Utility scripts - task data cleanup, schema fixes, dev monit...
  - Artifacts: 6 verified
  - Validations: 0 passed
  - KPIs: 0/2 met
</details>

## Artifact Hashes

SHA256 hashes for all verified artifacts:

```
aa5515b9664904ba61b7f469c533049dee40ac62640e0dbc1ee01bd86570e8bf  packages/sdk/README.md
61a317c4682d2a5998f13d8c2de37ca08f1bbee528319524873160234174d133  artifacts/misc/npm-publish-log.txt
e49bcc91ad6fe5bc5b0a9c9c00c8b0a6fdd04085ecfa8450aea2cea1dd3df6e3  artifacts/misc/autocomplete-demo.gif
869fc83b4b9957fba7643c30ff6b5fbc02630ecc1b192b3d95211dda57dc4949  apps/project-tracker/docs/metrics/_global/flows/FLOW-002.md
438a5729539842f4c1da092828199ea256759eb99e8cd39bed6e0bb4b0da0e47  apps/project-tracker/docs/metrics/_global/phase-validations/PHASE-002-validation.md
9c54ddf8618293664fc306ac40b48f3514cfe1213ae615b9a878071833b6dc8a  .specify/sprints/sprint-12/attestations/IFC-042/context_ack.json
c11dd1b4f77616e8f04c8f711a17c6a50e9b9b002cc4ff7aab536b7dd4858d91  apps/api/openapi.json
7ef7cbc23110f8fea0f966f85f45bca7add0aea01bcdbae72402a018f1509b03  artifacts/misc/postman-collection.json
237b0aac6b87b3bb52838cc495fdda5b0998a25440d054b7b267ea94e271e36f  .specify/sprints/sprint-12/attestations/IFC-081/context_ack.json
aea01b324e522b252bc4001257205eb66d730c15c7a0630a80fb8499b96ae0f9  apps/web/src/app/(public)/blog/page.tsx
0d44f8fcb00f1a8843a0e422004fbf7f643bc189509e87012ce3c621886c3c09  apps/web/src/components/blog/blog-pagination.tsx
d12adb38cf72956bc6e9b0d4026b65c11719d417b08b0065790e75107720b49d  artifacts/logs/blog-categories.json
d6a4d9a51a59fe8dd05a87950c93fdbc150949dba3e832e709b0aa5d114a427f  .specify/sprints/sprint-12/attestations/PG-009/context_ack.json
bb5cb864b162207db2656abcba4637eb189ed515134f3b0e0d6c5d12212e9c27  docs/planning/adr/ADR-020-public-site-auth.md
a858df0521ee9c76415a5fa3b40ab462f383bbd45ef6ae846cd18edec444bead  docs/planning/prd-public-site-auth.md
bff704cc2ef91bc168b4e8753405bfef0690c80f77b622fc9e364c82d6eb68bc  apps/web/src/app/(public)/blog/[slug]/page.tsx
f1f5319c6ca7733c6ee1313100c5b3e9992414c91523445d9fcf28f15d54961e  apps/web/src/components/blog/markdown-renderer.tsx
87eab0a32a5be94c929a90160b141483d3af97ec066ce0e852f157a97ea4885e  apps/web/src/components/blog/comments-widget.tsx
5c41421d3c2d2196a9a067c888db8488734363ce5c6142a3642d9f62a91b8b7c  .specify/sprints/sprint-12/attestations/PG-010/context_ack.json
722864ad97999c9e2495244b06a3b5c3a884a0ba6e747a667db510f4d1c5ebf6  apps/web/src/app/(public)/careers/page.tsx
f58203dbd71f1ae67f6710da0c2389c74e6eb86ecb637edd65d2cabeca9f3f70  apps/web/src/app/(public)/careers/[id]/page.tsx
46c5b371d079dff109221d99c9df73f59f949965eb6f3dd9ba1a114784c57b51  artifacts/misc/job-listings.json
c100472c75ce1250bd5538d33941fd7df247288c18b1569069d83fa30e3d920d  apps/web/src/components/shared/application-form.tsx
cd1ffee6e8e16ab563e09813cfa465901e010d6e67ad6e8eabf861e02653998e  .specify/sprints/sprint-12/attestations/PG-011/context_ack.json
48cc536ecb8ea13482086d944cb5c039a65eb51aaea6d39e3676167606c56539  apps/web/src/components/shared/job-detail-template.tsx
d078e4469bd9f02ac17f6e3fa52a755e23b01adbc4d3f6d0d4bb25e631bb773c  apps/web/src/components/shared/apply-button.tsx
7ad9917cb37491291b15cce4b28d72aa2088f2b525c95934ba3a925d28031b31  .specify/sprints/sprint-12/attestations/PG-012/context_ack.json
03bb1992a256b1791fae764c463ce4526717bb8ea85bb2e22677e3af1e8e2934  apps/web/src/app/(public)/lp/[slug]/page.tsx
4aa739e6aeb248c353068a42011a0b5f3b6a49f9f4f7fbc0c547cc733db11bc7  apps/web/src/components/shared/landing-builder.tsx
675cb63ef278625580a588f01969c7042695a9a800adb5cd1a95b2c1f9adc4b4  apps/web/src/lib/shared/ab-test-framework.ts
e52da7e4e7cbaafc87be483754420e2e714dfbc2e9c87849e11c8817f3a68c12  apps/web/src/data/landing-pages.json
c13f011366d3b153cacbd950dda1cc9da454e4c1489bcc74b4cf89fe9f4beec2  .specify/sprints/sprint-12/attestations/PG-013/attestation.json
6bdb07745b9a07f166d84ee1d150868ad5a7aedc5c0499cf3740bcd9cc9138e8  apps/web/src/app/(public)/status/page.tsx
0449444d341ce5bc729630e6ff830ed2733ab0bd688d7448d7faa91896847ddc  apps/web/src/components/status/status-monitor.tsx
462a2859474462b477bfd8cd9ae190e2ae50f42354316d1c0b62e16b2b0f503d  apps/web/lib/status/incident-tracker.ts
7561eb47676e04438f75e785080513ca9f514d3e6159d3ff675a3e65ef62f391  .specify/sprints/sprint-12/attestations/PG-014/context_ack.json
c1e3368e029d6a79cb964cbf92fd712bff49ad887aea0a417ad6e6d866512aa6  packages/platform/package.json
3694768136ca88d7c3d3b0c0c7c0318d9614053b72096741e80fd8f9824d2448  packages/platform/tsconfig.json
59933bcfafbab1426957183e0a12013a1daf6a452794b77eded25d143646606d  packages/platform/src/index.ts
beb957959442e0a3467dc673eb213eb226dff3a6a7673a34475792d345265a6f  packages\platform\src\feature-flags\types.ts
3c2dc00e220be21b31833efc2ef30f2e178230ea5eaf895fa56fabed97e4f986  packages\platform\src\feature-flags\schema.ts
fc4207609966d17e35fc80020c4d07be30aa8f4952d051d808559a53e862d667  packages\platform\src\feature-flags\index.ts
1e52767b8d13bb541d4d55a600784b7148411518830b3e698d9462cf375c28bb  packages\platform\src\feature-flags\in-memory-provider.ts
dc5d9c3747ab08afdd46d8a126a62f9ef3553903172511e938b895631b42bd5d  packages\platform\src\resilience\retry-policy.ts
5a03877be694ede3ad8d9ff8f4aadb58a252082c1d7f9285d475ef229a9d8538  packages\platform\src\resilience\resilient-call.ts
05c28d0d76ed597828a507e3ff0569539f5cb8e5474014e326517e5af71dafcf  packages\platform\src\resilience\index.ts
94cfeee3ffb8a59b74cc4eb6a8b1d94121be5d69da98fe057a72bb3325665090  packages\platform\src\resilience\circuit-breaker.ts
af1e8b7fc515b3a62edb5c2ea0730493a03468b95993b3c9378699099a56765f  packages\platform\src\queues\types.ts
281937e86ed303effd8a0862f39e31de1362a8abe83b6d6b45f6f25fd3ca67ba  packages\platform\src\queues\retry-strategy.ts
659c752c3c2a74656f5b75dff92d8220ced7d05c2e9f7f478cb051830c656263  packages\platform\src\queues\queues.test.ts
f459aef55998dea75d196f62102e4f66a9444f17b65945b0a974899f0b683f5d  packages\platform\src\queues\queue-factory.ts
3c249a79ac3cbdd2dc91929e96972c19d9002a62058e20881a6c5ff938de2593  packages\platform\src\queues\metrics-collector.ts
4ba33e71e8165265852dd77eec09360b69547cc981ebc4bde27e8f6c895e674b  packages\platform\src\queues\metrics-collector.additional.test.ts
ed6dca2231943b7ac6d006ac5e53d109eb286c0ee2bae9b477a1715bdfc87e4a  packages\platform\src\queues\index.ts
1c437b84e6f98eadc7a5f04d70f87756a6daa70e7af1fd2828a2622a058cf685  packages\platform\src\queues\connection.ts
06dfe3e959541adfb72cd93e956f72523eefc77e3305cc099f5a480132a18c6d  packages\platform\src\queues\bull-board.ts
cd4c52ea18988bb2f8e9f667583d1352a52efc7b71095497aeef7336a06472d5  packages\platform\src\workflow\rules-engine.ts
15164165b57cb7f0938e56c10e29e7a1d5d92d82ecf2180573aaaced9942b0f6  packages\platform\src\workflow\index.ts
ad063031756a416d865f318b2e3495de8e430300843a39e03868515ee4a6c0b2  packages\platform\src\workflow\engine.ts
f0486616386af212a4a5930ab8f19198b40bfef75259e810c90e2d1c28f842b1  .specify/sprints/sprint-12/attestations/EXP-PLATFORM-001/context_ack.json
1ccd9d8caeafa6d4cc02c68b0914f52a8f1a572a38be89efc7596a109f459fa7  scripts/clean-fake-task-data.ps1
7a98aa4929eb1d78d1de59c0b6fd72c6226011da487d2a19f3a5af391df1ed88  scripts/fix-task-json-schema.ps1
ba554c504d6b0cd61e13b6220092e692ce4c8d3c92763e22cfbbaeec945676c5  scripts/fix-uppercase-sha256.ps1
d5a4536aeacc3a4ded230d5183c5220392f3275e714a92b6ae192bb396dc8861  scripts/run-soft.js
05045d3e8875220d72c60f589b42b1a7ba03da824e0c452d63042c5ab2f73275  scripts/monitor-dev.sh
dcb1f1ad6e0a7fa31bf5336a7c6f01d6c9d9026cba90c1d353658885c2032a17  .specify/sprints/sprint-12/attestations/EXP-SCRIPTS-001/context_ack.json
4cf216fc73e3223ee5676565f0b39a9e8dbfe29d162ec001dac3f274700ecb9c  apps/api/src/lib/supabase.ts
a014f3e2e773fb0e2a8058a655abdeeef7371bbbc5bb86581c1bc64cc91b13a2  docs/operations/env-requirements.md
f8edf5f2027ee0fd79ff3ef362530b853c7204cb9a0b5ab80788d0c8bf9bbb7e  .specify/sprints/sprint-12/attestations/IFC-169/context_ack.json
e33da53e5dab47ca297af5214fda639de8aa904199e6f6869f797ea08f26fabc  apps/workers/notifications-worker/src/channels/sms.ts
37edded5e714e744d9e37a50920cd69cd7dbccdaf7dea7c43f6ab5ac14d89617  packages/adapters/src/messaging/twilio/client.ts
d114886fe92d0f40ae4030866245ab1099efda515f96907d4f8f9563bdd7a6cd  .specify/sprints/sprint-12/attestations/IFC-170/context_ack.json
d1e7c9d7d10b2cc48ca9a118aab23d573db28628503a4ae13b6b33dc1ae8d67a  docs/planning/adr/ADR-023-communications-inbox.md
a84daec917f9ff17c37e84f73cb87aa83eab79c6c4cf2317538ee48049e56e52  docs/planning/prd-communications-inbox.md
3b8a2e21ca208a170712d7b81eb893309d4f3b4a17b194517c8631887484fe21  apps/workers/notifications-worker/src/channels/webhook.ts
10b3f47727e43161f831869c040c85ee6562dd50795cea041b318cffff18d907  apps/workers/notifications-worker/src/__tests__/webhook.test.ts
49cb2660eb4007a723a3ebe7e5f2a9b1915023427118b9edf145d0682a7712ff  packages/adapters/src/webhooks/outbound.ts
2f8cc6b6928b529baf31d293b37c707cc4129f7bab674b4feb51f04db878ee0c  .specify/sprints/sprint-12/attestations/IFC-171/context_ack.json
```

---

*Generated by sprint-completion-auditor at 2026-02-28T23:53:34.395Z*