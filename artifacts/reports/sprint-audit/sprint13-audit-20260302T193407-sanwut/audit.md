# Sprint 13 Completion Audit Report

**Run ID:** `sprint13-audit-20260302T193407-sanwut`
**Generated:** 02/03/2026, 19:34:19
**Duration:** 12.1 seconds
**Strict Mode:** No

## ❌ Overall Verdict: **FAIL**

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks in Sprint | 20 |
| Completed Tasks | 20 |
| Tasks Audited | 20 |
| ✅ Passed | 19 |
| ❌ Failed | 1 |
| ⚠️ Needs Human Review | 0 |

## Evidence Summary

| Category | Found | Issues |
|----------|-------|--------|
| Artifacts | 109 ✓ | 0 missing, 0 empty |
| Validations | 31 passed | 1 failed |
| KPIs | 0 met | 0 missed |
| Placeholders (in task artifacts) | - | 0 found |
| Placeholders (codebase total) | - | 390 found |

## ⛔ Blocking Issues

These issues must be resolved before sprint can be considered complete:

### 🔴 Critical
- **IFC-159**: Validation(s) failed: pnpm test:e2e
  - *Recommendation:* Fix failing validations before marking complete

### 🟠 High
- **IFC-159**: 5 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete

## Task Details

### ❌ Failed Tasks

#### ❌ IFC-159

**Description:** Case timeline enrichment: include documents/versions, communications (email/WhatsApp), and agent actions/approvals as timeline events
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm test:e2e
- 5 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm test:e2e` (exit code: 124)
  - Error: Command timed out after 600000ms

---

### ✅ Passed Tasks

<details>
<summary>Click to expand passed tasks</summary>

- **PG-015**: Sign In...
  - Artifacts: 6 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **PG-016**: Sign Up...
  - Artifacts: 8 verified
  - Validations: 2 passed
  - KPIs: 0/5 met
- **PG-017**: Sign Up Success...
  - Artifacts: 5 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **PG-018**: Logout...
  - Artifacts: 11 verified
  - Validations: 2 passed
  - KPIs: 0/5 met
- **PG-019**: Forgot Password...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **PG-020**: Reset Password...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/4 met
- **PG-021**: MFA Setup...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **PG-022**: MFA Verify...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/2 met
- **PG-023**: Email Verification...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/2 met
- **PG-024**: SSO Callback...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **PG-104**: Settings Home...
  - Artifacts: 4 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **IFC-163**: Standardize worker runtime under apps/workers (events, inges...
  - Artifacts: 9 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **IFC-172**: Complete Microsoft Calendar integration - Follow-up to IFC-1...
  - Artifacts: 5 verified
  - Validations: 2 passed
  - KPIs: 0/3 met
- **IFC-173**: Complete inbound email parsing endpoint - Follow-up to IFC-1...
  - Artifacts: 5 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **IFC-182**: Home Page tRPC Router - Welcome summary activity feed AI ins...
  - Artifacts: 6 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **IFC-183**: Notifications tRPC Router - List mark read preferences real-...
  - Artifacts: 4 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **PG-140**: Document Manager Page - Upload viewer version history ACL ma...
  - Artifacts: 7 verified
  - Validations: 1 passed
  - KPIs: 0/6 met
- **IFC-198**: Billing Domain Core - Invoice/Receipt aggregates, payment st...
  - Artifacts: 6 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
- **IFC-200**: Analytics Adapter Layer - query builders and export pipeline...
  - Artifacts: 6 verified
  - Validations: 1 passed
  - KPIs: 0/3 met
</details>

## Artifact Hashes

SHA256 hashes for all verified artifacts:

```
13705e34eb891e7c34985ab15b58d33a9aa8dbf33a29ec464b4191e10f2b6a39  apps/web/src/app/(public)/login/page.tsx
aa97bacbc4ce72faa566dcf298d294766503e12671f6d3395a100bc7ec2d7ab4  apps/web/src/components/shared/auth-providers.tsx
d399d5566aca3c498c22d16fdbee047336e7061345d6672e51fd2ca19bc82872  apps/web/src/lib/shared/login-security.ts
ecb13ace244f3489d55091b0506530ddaa781346628cd2f10f29cf10f78309ae  .specify/sprints/sprint-13/execution/PG-015/20260125-173318/PG-015-delivery.md
bb5cb864b162207db2656abcba4637eb189ed515134f3b0e0d6c5d12212e9c27  docs/planning/adr/ADR-020-public-site-auth.md
a858df0521ee9c76415a5fa3b40ab462f383bbd45ef6ae846cd18edec444bead  docs/planning/prd-public-site-auth.md
ad2db57cd2c2c1cd000343cbca7ec262c1376e4452808147c7e4344b31dad8a1  apps/web/src/app/(public)/signup/page.tsx
46a340331c6b643cedd1c3f21bb778aace8f2967c2733bfba5423962c24b216e  apps/web/src/components/shared/registration-form.tsx
8ce9729af07f8c80ab607cb5d6cbd061b5ef39ec18c16525e7e46353b62aa547  apps/web/src/lib/shared/welcome-email.ts
9df38dcbb1c230a8b90b03155ddf27b1e89b9486edc265545a25e14e3f750340  apps/web/src/lib/shared/password-breach-check.ts
a6174c55b2f32938b8df98096a99a89e5e356115a3b992dbf226e8e3f12ea859  apps/web/src/lib/shared/signup-rate-limiter.ts
6c0dd3b5aeb719d805c914feec8e6a27d98a1f266ad9093f095fef80881f22de  .specify/sprints/sprint-13/attestations/PG-016/context_ack.json
dade9bf40fbf75266b8b530da4eea584feb21ca576c4e66eb538defaba9f9289  apps/web/src/app/(public)/signup/success/page.tsx
70c73986ffbea04ea123d5e86320b07a470802fa3465097d8465c71dd5523746  apps/web/src/components/shared/onboarding-flow.tsx
b36f64db76396e0e7b1968a6b6b4477599186c8791be9dfb1802cfcc53e46a3e  apps/web/src/lib/shared/tracking-pixel.ts
6b74a7041135bdc7e3c9d4866267159b0d75de5478a211a98a0b1d9b99ea0e68  .specify/sprints/sprint-13/attestations/PG-017/context_ack.json
129c5ae5710ed251aaaee871135f32cf7891f6ba20e6804abf8fe20c2a7dae0c  .specify/sprints/sprint-13/attestations/PG-017/attestation.json
2c0881d70ca1c54cec9f62afe403faaa22c471688222a767ea1cb8908484e493  apps/web/src/app/(public)/logout/page.tsx
1b7ac0468e00ccfa0dddded6b181cefbb903d75178fa109927f3e773ad760a9b  apps/web/src/lib/shared/session-cleanup.ts
17d45d1e182c73fb8d46fd4053e1b4e4ddd074ce1bc7fc86da070c4863ddb895  apps/web/src/lib/shared/logout-redirect.ts
0d306518e5334d2beb91e570a2cb3f592108ff24f0ecff97d993f4c2586b5afb  apps/web/src/hooks/useLogout.ts
e371b466c6a26645625321aae6dc15d2dfec3396767835d2bff693362a172d2e  apps/web/src/hooks/useUnsavedChanges.tsx
9885e134e385870cfb6a7be30f1e311a11c0bcb8a43923a004f1cc9cbee60816  apps/web/src/lib/broadcast.ts
c1b57e13f7237b415501e9b09cada25f96117e321e73e25040149f8b74c70454  apps/web/src/components/auth/logout-button.tsx
a897b5d784e96db3fc9f17ca362e1ab85359c9658be1255da6defffcb8ad0e96  apps/web/src/components/auth/unsaved-work-modal.tsx
ea255df33de30275e81d249d7ced34dd386ac46b0161a6410bbfe87550b79ded  .specify/sprints/sprint-13/execution/PG-018/20260126-000000/PG-018-delivery.md
9640170198d39ef849c891f3d4c4f4da11d5cef75f13505726114d97f70b765e  apps/web/src/app/(public)/forgot-password/page.tsx
889d7dcd64342b580115728a0464f58ad023fa74f2668f1c9c0c381983a3047d  apps/web/src/components/shared/reset-email.tsx
59fa89e91e4ed805d8d899c04c33a0ed9df2724adab73bd891f648193ee43947  apps/web/src/lib/shared/reset-token.ts
1a70c473bfd3528187abf3f0bf25be3a0ac500c24ee70827d588fe7be2b0a7d6  .specify/sprints/sprint-13/attestations/PG-019/context_ack.json
2e5b8516a80a1e30eb98a65fc02e463672871a0ee2508b7c47ea4781a98c605a  apps/web/src/app/(public)/reset-password/[token]/page.tsx
e42ba8abfa2dc769b6a03545d22ffccdc2d526e43416662d54bfc2788e8c9e51  apps/web/src/components/shared/password-reset.tsx
eee777b7f28389207a0a3fd62f40cb52267a2ddfac4e4c407b8230b370346024  apps/web/src/lib/shared/password-validation.ts
d81d085fcce0e1dc4615f8456751a8990103e4bb962a0aeba582e9b743ac6f7e  .specify/sprints/sprint-13/attestations/PG-020/attestation.json
89145bbdb5f3797153e91478254bcbfb52f90a4dd2249db24d50cb9e087a2058  apps/web/src/app/settings/security/mfa/page.tsx
69288fbe6854e3ef7dea059c599bc3216dc64d33c9c4f5c14af61f8573846dbd  apps/web/src/components/shared/mfa-qr-generator.tsx
6d9c43b73904e6286aaa621296b24f72b0be90ca683a5e43503e0226b4bae58b  apps/web/src/lib/shared/backup-codes.ts
c87e7ccff34f0375ebe288609228df6878a702643ec19907c6228e0395912611  .specify/sprints/sprint-13/attestations/PG-021/context_ack.json
98433b5925507b8db1ccd7c5af62d809122f64694be026939b6d32a5e264d9e8  apps/web/src/app/(public)/mfa/verify/page.tsx
6b022e19ec481a6853441934f7a98b83b24cc4eaf8d6aa89f07746f5440cd1c6  apps/web/src/components/shared/mfa-verification.tsx
538126e801fa99a7d3afe81f9ca3c01edb5ecd444f96dd1f940417bc0c214eeb  apps/web/src/lib/shared/code-validator.ts
d3dd1022809160e3b0d69a827d13e3ddaedca4290e09af5e6651a9c9999c87ac  .specify/sprints/sprint-13/attestations/PG-022/context_ack.json
7110725183e3c94d66253e31dbed25df491856ee59ea6d11c44387a8e844aeca  apps/web/src/app/(public)/verify-email/[token]/page.tsx
ad5651bee8436829f04781b8d5a1cb187ddaceb582f856cb8895847470981c20  apps/web/src/components/shared/email-verification.tsx
06aa61c245a48efd6423e6e8a133847268ce7c21742a862776280e11aab2212f  apps/web/src/lib/shared/account-activation.ts
e66c31acac2c6a30e442d2b07fcb2838211c8dd1113fc0e1d4dbd2a492677d70  .specify/sprints/sprint-13/attestations/PG-023/context_ack.json
d89f2379e175fe5c7d1abf65f79758a543e3642d28a30dff56d6833157a468a2  apps/web/src/app/(public)/auth/callback/page.tsx
dea6217125b3917ca29ebf046459e8545afb3c4cd66ac2a26b899e417f9166be  apps/web/src/components/shared/oauth-callback.tsx
94dc5a382dcbe26595efb36d92334ab9cf07d685a4e56fb185c7295ca4a53019  apps/web/src/lib/shared/token-exchange.ts
dd1b9be2a0a3fd43ca774e0cc0dd4c081e0e167663e1ed9727613513567e3c7a  .specify/sprints/sprint-13/attestations/PG-024/attestation.json
b84a25c0a55fb42c9ba4d299dff20e6e256d9ad0e413ce7d1dbbe2ef2315baa2  apps/web/src/app/settings/page.tsx
48bf4d4130080c4fb41078ee2c603609d7c8455db2a689b2316d514329b4ce2c  apps/web/src/components/shared/settings-nav.tsx
cdaf7075493e4aed54748b18913bb27c0120ee25065601b39a6250d3f1528eb9  apps/web/src/lib/shared/settings-search.ts
c33e241dabb6994ea8493faa53a97343a81ceef0e2b2608d296fa5cacb7373ec  .specify/sprints/sprint-13/attestations/PG-104/context_ack.json
cfe1d913ec30d6b5c2d187e60ef14f5c4580bcbb5be6f1114fd29d08b0a62204  apps/api/src/modules/misc/timeline.ts
942f2f914c7f8ea45f8490d312e3b322db15d4c1334cba9aaa07af7ff08036cc  apps/web/lib/documents/timeline-event-model.ts
df82f9badfd16eb365a6a270706d611d25c278b75fcc37a9cc8258dfa33b52cd  .specify/sprints/sprint-13/attestations/IFC-159/context_ack.json
9a32d1c6548da3e38eb556a00fc63d51f40d11649ac83dffd328c0a31be19901  apps/workers/events-worker/src/main.ts
f029b4fc639b0f3f3a33624946df01a15fa69c46ded5e24fb2c50e4bec794f30  apps/workers/events-worker/src/outbox/pollOutbox.ts
9412b106c31358eb5814561e7da8edf93b9f8430409820cad024c3e556dd79a3  apps/workers/ingestion-worker/src/main.ts
3f4d886fd1304e9348e2de2c924198523b1e30db1720abd999352f3cc1d35950  apps/workers/ingestion-worker/src/jobs/extractText.job.ts
3524adc66a49918a00d6800538e6a2074de39fb4a6d4cce586004eb5401c50e9  apps/workers/notifications-worker/src/main.ts
f96edcb1508a64dc85c1e418f6ac8e23cfbccc33bf8fd5cd838bf42377a35014  apps/workers/notifications-worker/src/channels/email.ts
580ae1706c1db33cfbee63d8b07d70b58fafee8b2fd4613001816d6825d824c8  infra/monitoring/dashboards/workers.json
d290641c28e0d91bd6b3c61634cc828523d1d35f057b112ae0e6cda598383a8b  docs/operations/workers-runbook.md
ae530265d9096e2fbcda9ac84a695acf6b655fd24ecb3a7f495bafc3650c9e8e  .specify/sprints/sprint-13/attestations/IFC-163/context_ack.json
8c51f08ad0af1e25e4e5420ae3921f84a5bf20df099ebe3a18a2f437ddceadba  packages/adapters/src/calendar/microsoft/client.ts
8ee63885082eed73218f58bf6e005bfa55c30bac0a6aa2f42214a3846b12fd8d  packages/adapters/src/calendar/microsoft/__tests__/client.test.ts
30e26fe4ec70a9abbbabb4fd52c9c44dae911b546f14f1fe11c6b2d6b6924a13  .specify/sprints/sprint-13/attestations/IFC-172/context_ack.json
1a94a37f6236e82e5b4f3bcee4b9d9d60bf2c0cc9dcd0f41a322d0ad760808d4  docs/planning/adr/ADR-024-scheduling-calendar.md
b1c8ea6dd8248d74468b2b3449dc7ff6c1acb7a7f6c6d0d3ff61dfe50bb47368  docs/planning/prd-scheduling-calendar.md
9739778e3a69cdea304b86120ea7c291abb6ab161c7c5ee90bfbc8f59a76607c  packages/adapters/src/messaging/email/inbound.ts
f9bf635662b6cc8bab3f1c63b4b1efc0885a8231f8986f14a70f26e04aecbe4e  apps/api/src/modules/email/inbound.router.ts
220212c3e7a6009e1d2c1ff7c377a6dbff06a4a0e6fcdea1df9301d1a25a84d4  .specify/sprints/sprint-13/attestations/IFC-173/context_ack.json
d1e7c9d7d10b2cc48ca9a118aab23d573db28628503a4ae13b6b33dc1ae8d67a  docs/planning/adr/ADR-023-communications-inbox.md
a84daec917f9ff17c37e84f73cb87aa83eab79c6c4cf2317538ee48049e56e52  docs/planning/prd-communications-inbox.md
f807a632cb3bd1b218d6c15c05bd5d0e29dbd90e0dac95fd70770d7768dc07c0  apps/api/src/modules/home/home.router.ts
c584e132fa0bae1639fcb5ce58fe94e3c14f9efedb8e8a904cd17f7c1fccacab  packages/validators/src/home.ts
368bfcf19b74f0c1f6dcf70dce5a151c7454d7c190cc9043fbcaa5bb4ad00605  apps/api/src/modules/home/__tests__/home.router.test.ts
f9d2090dbc45f355f99802528dd429a51d8cbdabd9a3f52ded99b7491120d6c0  docs/planning/prd-home-page.md
6d9a466095112d2edf916bc0e37c9178e89bc105e0f6d0bbceac0637b1f869ee  docs/specs/HOME-PAGE-SPEC.md
16312d9883bd9e495ee6101206e91deb2f33377c5735ded2a66e9082c0a5eed9  .specify/sprints/sprint-13/attestations/IFC-182/attestation.json
8b5950f26aa97ab3bc19829e8c6aa784b77308a71137fb69a430c0f194045139  apps/api/src/modules/notifications/notifications.router.ts
fdb19246c60f6ab84cc9ca56448e7037389fb29d0d9b17239a7af4cf520faa3c  packages/validators/src/notifications.ts
addc328e267498a814c2f0eaf83191701bbfec915a23804e1ca65369c5839382  apps/api/src/modules/notifications/__tests__/notifications.router.test.ts
d9db7701c3d2b8dd2bc53015f068ac2d391a8eef6f19f03324f517782f23c6fa  .specify/sprints/sprint-13/attestations/IFC-183/context_ack.json
2ed07c240722b20f683a37ac61aa39a96323d8efec8e600f6e4afd8985e91ec4  apps/web/src/app/documents/(list)/page.tsx
62558e1754d6cfb7762e2d56a7377fd0f76084ccc7bc9edc62dc5230efdf995a  apps/web/src/app/documents/[id]/page.tsx
c4cf06359b47684306dbcd803a310b07db5c63d8fd3693daee0a1765feb706e9  apps/web/src/components/documents/DocumentList.tsx
44f5968dc2f1d07614ffa023d72dd17e6cf37b8a69a3e63bbc5259ee7a5f2ee1  apps/web/src/components/documents/DocumentUpload.tsx
0ebe9fc138570867c372e43e84f38e6a3be45a042194c5e18b070b77b8e6b646  apps/web/src/components/documents/DocumentViewer.tsx
ae0cb1468418778b428f521985bf5d381f36e53e8d1289785ee8e8495be18d35  apps/web/src/components/documents/VersionHistory.tsx
16050e673a8788fbbff003f4179698e00eae58e3b4c6b96072a5d1f1936260bb  .specify/sprints/sprint-13/attestations/PG-140/context_ack.json
3303fc4ca92d11cf605b29efd26d62f55d7490f0598002d479784b1af87ca6b6  packages/domain/src/crm/billing/Invoice.ts
4a406772690acad87a098b2b3d96608c0a7d8443e1f1f191bf8cc63af27bc7cf  packages/domain/src/crm/billing/Receipt.ts
0881b391ab6412fb77c973ec4773ee35a6cb6f49a6d984e5812361ee253d903e  packages/application/src/services/BillingDomainService.ts
4419ba45fbf7a65aac882a01158fcca90953871f8e3185497dfee16f5dbac6e6  packages/application/src/services/__tests__/BillingDomainService.test.ts
103f811fece8d1227b99d084319444cf220360265952e4b7ecb7b0e26ecb2fd4  .specify/sprints/sprint-13/attestations/IFC-198/context_ack.json
ce4cbb15ab00abbb77949672b437a6f94bc114ede97d8b2ee052244f050594a1  docs/planning/prd-billing-domain.md
f0ec029166bd44b7dd58c63185186b8b84ec5cc120c616389fe1a90965ae517f  packages/adapters/src/repositories/PrismaAnalyticsRepository.ts
0012470b22e90fa5dc57802bb7f4bb9074ab9fcac2dcf7e4fb1fc3f12038730c  packages/application/src/services/AnalyticsAggregationService.ts
5a8d857d65ca3af5bace01a52bc068f5317d7c4fafecbbc5ed3da63666ef8a40  apps/api/src/modules/analytics/analytics.router.ts
9d0eacccfa011b96098b82fb27441da77292713e442fa33a45bb4f029f9ed907  apps/api/src/modules/analytics/__tests__/analytics.router.test.ts
e391e463b4885d03243944526a8bd229ab177c8fcb190008526eea59929ec599  .specify/sprints/sprint-13/attestations/IFC-200/context_ack.json
9b5ab0e7fd587a81694c1c426fd30037170cb624fbdf8217da444d425f26a5bf  docs/planning/prd-analytics-adapter.md
```

---

*Generated by sprint-completion-auditor at 2026-03-02T19:34:19.477Z*