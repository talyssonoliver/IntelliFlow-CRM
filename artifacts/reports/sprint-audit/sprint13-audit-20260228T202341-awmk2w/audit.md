# Sprint 13 Completion Audit Report

**Run ID:** `sprint13-audit-20260228T202341-awmk2w`
**Generated:** 28/02/2026, 20:23:47
**Duration:** 6.0 seconds
**Strict Mode:** No

## ❌ Overall Verdict: **FAIL**

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks in Sprint | 20 |
| Completed Tasks | 20 |
| Tasks Audited | 20 |
| ✅ Passed | 5 |
| ❌ Failed | 10 |
| ⚠️ Needs Human Review | 5 |

## Evidence Summary

| Category | Found | Issues |
|----------|-------|--------|
| Artifacts | 109 ✓ | 0 missing, 0 empty |
| Validations | 0 passed | 10 failed |
| KPIs | 0 met | 0 missed |
| Placeholders (in task artifacts) | - | 41 found |
| Placeholders (codebase total) | - | 1331 found |

## ⛔ Blocking Issues

These issues must be resolved before sprint can be considered complete:

### 🔴 Critical
- **PG-015**: Validation(s) failed: pnpm test
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-159**: Validation(s) failed: pnpm test
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-163**: Validation(s) failed: pnpm test
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-172**: Validation(s) failed: pnpm test
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-173**: Validation(s) failed: pnpm test
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-182**: Validation(s) failed: pnpm test
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-183**: Validation(s) failed: pnpm test
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **PG-140**: Validation(s) failed: pnpm test
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-198**: Validation(s) failed: pnpm test
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-200**: Validation(s) failed: pnpm test
  - *Recommendation:* Fix failing validations before marking complete

### 🟠 High
- **PG-015**: Found 1 placeholder(s) in task artifacts
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **PG-015**: 7 DoD criteria unverified
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-159**: 5 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-163**: Found 9 placeholder(s) in task artifacts
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-163**: 9 DoD criteria unverified
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-172**: Found 1 placeholder(s) in task artifacts
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-172**: 6 DoD criteria unverified
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-173**: Found 6 placeholder(s) in task artifacts
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-173**: 5 DoD criteria unverified
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-182**: Found 1 placeholder(s) in task artifacts
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-182**: 9 DoD criteria unverified
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-183**: Found 7 placeholder(s) in task artifacts
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-183**: 9 DoD criteria unverified
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **PG-140**: Found 7 placeholder(s) in task artifacts
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **PG-140**: 9 DoD criteria unverified
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-198**: 6 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete
- **IFC-200**: 6 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete

## Task Details

### ❌ Failed Tasks

#### ❌ PG-015

**Description:** Sign In
**Status:** Completed

**Issues:**
- Found 1 placeholder(s) in task artifacts
- Validation(s) failed: pnpm test
- 7 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders
- Fix failing validations before marking complete

**Placeholders Found:**
- `apps\web\src\app\(public)\login\page.tsx:458` - PLACEHOLDER: `...lg border bg-white/5 text-white placeholder:tex...`

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-159

**Description:** Case timeline enrichment: include documents/versions, communications (email/WhatsApp), and agent actions/approvals as timeline events
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

#### ❌ IFC-163

**Description:** Standardize worker runtime under apps/workers (events, ingestion, notifications) with shared job framework, metrics, and deployment packaging
**Status:** Completed

**Issues:**
- Found 9 placeholder(s) in task artifacts
- Validation(s) failed: pnpm test
- 9 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders
- Fix failing validations before marking complete

**Placeholders Found:**
- `apps\workers\ingestion-worker\src\main.ts:186` - PLACEHOLDER: `// Placeholder - delegate to OCRWorker in producti...`
- `apps\workers\ingestion-worker\src\main.ts:189` - PLACEHOLDER: `text: '[OCR processing placeholder]',...`
- `apps\workers\ingestion-worker\src\main.ts:190` - PLACEHOLDER: `normalizedText: '[OCR processing placeholder]',...`
- `apps\workers\ingestion-worker\src\main.ts:212` - PLACEHOLDER: `// Placeholder...`
- `apps\workers\notifications-worker\src\main.ts:160` - PLACEHOLDER: `// For now, they are placeholder implementations...`
- ... and 4 more

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-172

**Description:** Complete Microsoft Calendar integration - Follow-up to IFC-138
**Status:** Completed

**Issues:**
- Found 1 placeholder(s) in task artifacts
- Validation(s) failed: pnpm test
- 6 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders
- Fix failing validations before marking complete

**Placeholders Found:**
- `packages\adapters\src\calendar\microsoft\__tests__\client.test.ts:309` - XXX: `'https://graph.microsoft.com/v1.0/me/calendar/even...`

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-173

**Description:** Complete inbound email parsing endpoint - Follow-up to IFC-144
**Status:** Completed

**Issues:**
- Found 6 placeholder(s) in task artifacts
- Validation(s) failed: pnpm test
- 5 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders
- Fix failing validations before marking complete

**Placeholders Found:**
- `apps\api\src\modules\email\inbound.router.ts:334` - TODO: `// TODO (PG-084): Wire to GmailAdapter.forwardMess...`
- `apps\api\src\modules\email\inbound.router.ts:433` - TODO: `// TODO (PG-084): Generate signed URL from S3/Supa...`
- `apps\api\src\modules\email\inbound.router.ts:434` - PLACEHOLDER: `// For now, return the stored URL or a placeholder...`
- `apps\api\src\modules\email\inbound.router.ts:447` - TODO: `* TODO (PG-084): Wire to GmailAdapter.sendMessage(...`
- `apps\api\src\modules\email\inbound.router.ts:502` - TODO: `// TODO (PG-084): After creating the record, dispa...`
- ... and 1 more

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-182

**Description:** Home Page tRPC Router - Welcome summary activity feed AI insights pinned items daily goals
**Status:** Completed

**Issues:**
- Found 1 placeholder(s) in task artifacts
- Validation(s) failed: pnpm test
- 9 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders
- Fix failing validations before marking complete

**Placeholders Found:**
- `apps\api\src\modules\home\__tests__\home.router.test.ts:31` - EMPTY_FUNCTION: `() => {
    // Reset is handled by setup.ts
  }...`

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-183

**Description:** Notifications tRPC Router - List mark read preferences real-time subscription
**Status:** Completed

**Issues:**
- Found 7 placeholder(s) in task artifacts
- Validation(s) failed: pnpm test
- 9 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders
- Fix failing validations before marking complete

**Placeholders Found:**
- `apps\api\src\modules\notifications\notifications.router.ts:44` - TODO: `// TODO: Replace with Redis pub/sub for multi-inst...`
- `apps\api\src\modules\notifications\__tests__\notifications.router.test.ts:1074` - EMPTY_FUNCTION: `() => {}...`
- `apps\api\src\modules\notifications\__tests__\notifications.router.test.ts:1096` - EMPTY_FUNCTION: `() => {}...`
- `apps\api\src\modules\notifications\__tests__\notifications.router.test.ts:1114` - EMPTY_FUNCTION: `() => {}...`
- `apps\api\src\modules\notifications\__tests__\notifications.router.test.ts:1132` - EMPTY_FUNCTION: `() => {}...`
- ... and 2 more

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ PG-140

**Description:** Document Manager Page - Upload viewer version history ACL management search
**Status:** Completed

**Issues:**
- Found 7 placeholder(s) in task artifacts
- Validation(s) failed: pnpm test
- 9 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders
- Fix failing validations before marking complete

**Placeholders Found:**
- `apps\web\src\components\documents\DocumentUpload.tsx:158` - TODO: `// TODO: Wire to trpc.upload.upload.useMutation() ...`
- `apps\web\src\components\documents\DocumentUpload.tsx:158` - NOT_WIRED_COMMENT: `// TODO: Wire to trpc.upload.upload.useMutation() ...`
- `apps\web\src\app\documents\[id]\page.tsx:268` - TODO: `signerEmail: 'user@company.com', // TODO: Fetch us...`
- `apps\web\src\app\documents\[id]\page.tsx:957` - PLACEHOLDER: `...#137fec] min-h-[80px] p-3 placeholder:text-slat...`
- `apps\web\src\app\documents\(list)\page.tsx:172` - EMPTY_FUNCTION: `{ id: 'sep-1', icon: '', label: '', onClick: () =>...`
- ... and 2 more

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-198

**Description:** Billing Domain Core - Invoice/Receipt aggregates, payment state machine, tax/refund rules
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

#### ❌ IFC-200

**Description:** Analytics Adapter Layer - query builders and export pipeline for metrics router
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

### ⚠️ Needs Human Review

#### ⚠️ PG-016

**Description:** Sign Up
**Status:** Completed

**Issues:**
- Found 2 placeholder(s) in task artifacts
- 6 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders

**Placeholders Found:**
- `apps\web\src\components\shared\registration-form.tsx:435` - PLACEHOLDER: `'w-full px-4 py-3 rounded-lg border bg-slate-800/5...`
- `apps\web\src\components\shared\registration-form.tsx:478` - PLACEHOLDER: `'w-full px-4 py-3 rounded-lg border bg-slate-800/5...`

---

#### ⚠️ PG-018

**Description:** Logout
**Status:** Completed

**Issues:**
- Found 2 placeholder(s) in task artifacts
- 6 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders

**Placeholders Found:**
- `apps\web\src\lib\shared\session-cleanup.ts:312` - EMPTY_FUNCTION: `() => {}...`
- `apps\web\src\components\auth\logout-button.tsx:106` - TODO: `// TODO: In a real implementation, this would trig...`

---

#### ⚠️ PG-019

**Description:** Forgot Password
**Status:** Completed

**Issues:**
- Found 1 placeholder(s) in task artifacts
- 6 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders

**Placeholders Found:**
- `apps\web\src\components\shared\reset-email.tsx:110` - PLACEHOLDER: `'bg-slate-800/50 border text-white placeholder-sla...`

---

#### ⚠️ PG-021

**Description:** MFA Setup
**Status:** Completed

**Issues:**
- Found 2 placeholder(s) in task artifacts
- 6 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders

**Placeholders Found:**
- `apps\web\src\app\settings\security\mfa\page.tsx:455` - PLACEHOLDER: `'text-foreground placeholder:text-muted-foreground...`
- `apps\web\src\app\settings\security\mfa\page.tsx:519` - PLACEHOLDER: `{/* SMS/Email Setup Step (placeholder) */}...`

---

#### ⚠️ PG-022

**Description:** MFA Verify
**Status:** Completed

**Issues:**
- Found 2 placeholder(s) in task artifacts
- 6 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders

**Placeholders Found:**
- `apps\web\src\components\shared\mfa-verification.tsx:223` - TODO: `// TODO: Call auth.resendMfaCode with _method when...`
- `apps\web\src\app\(public)\mfa\verify\page.tsx:64` - EMPTY_FUNCTION: `() => {
    // MfaVerification handles redirect in...`

---

### ✅ Passed Tasks

<details>
<summary>Click to expand passed tasks</summary>

- **PG-017**: Sign Up Success...
  - Artifacts: 5 verified
  - Validations: 0 passed
  - KPIs: 0/3 met
- **PG-020**: Reset Password...
  - Artifacts: 4 verified
  - Validations: 0 passed
  - KPIs: 0/4 met
- **PG-023**: Email Verification...
  - Artifacts: 4 verified
  - Validations: 0 passed
  - KPIs: 0/2 met
- **PG-024**: SSO Callback...
  - Artifacts: 4 verified
  - Validations: 0 passed
  - KPIs: 0/3 met
- **PG-104**: Settings Home...
  - Artifacts: 4 verified
  - Validations: 0 passed
  - KPIs: 0/3 met
</details>

## Artifact Hashes

SHA256 hashes for all verified artifacts:

```
1b4ee2902ab9e3e506d0fd321f94b9b77601ef16f45709f43b3c27bc1268772c  apps/web/src/app/(public)/login/page.tsx
aa97bacbc4ce72faa566dcf298d294766503e12671f6d3395a100bc7ec2d7ab4  apps/web/src/components/shared/auth-providers.tsx
9b53677762d889c7b6a2ff67b0455861f18e49e8b4fe6fd4e66cad8175680a2e  apps/web/src/lib/shared/login-security.ts
ecb13ace244f3489d55091b0506530ddaa781346628cd2f10f29cf10f78309ae  .specify/sprints/sprint-13/execution/PG-015/20260125-173318/PG-015-delivery.md
bb5cb864b162207db2656abcba4637eb189ed515134f3b0e0d6c5d12212e9c27  docs/planning/adr/ADR-020-public-site-auth.md
a858df0521ee9c76415a5fa3b40ab462f383bbd45ef6ae846cd18edec444bead  docs/planning/prd-public-site-auth.md
ad2db57cd2c2c1cd000343cbca7ec262c1376e4452808147c7e4344b31dad8a1  apps/web/src/app/(public)/signup/page.tsx
8a424b25a440b366705db35d91a692530839a5e5c78b19b010acb24611e00d71  apps/web/src/components/shared/registration-form.tsx
211e51853723f0102aab03de73c3da6740d81ba2928493d03a5b6d6d3effb51d  apps/web/src/lib/shared/welcome-email.ts
68bb094432ff20d290d7073f276631d7218bfeefcf0ac2d900e2dd0ce8515e2d  apps/web/src/lib/shared/password-breach-check.ts
a6174c55b2f32938b8df98096a99a89e5e356115a3b992dbf226e8e3f12ea859  apps/web/src/lib/shared/signup-rate-limiter.ts
6c0dd3b5aeb719d805c914feec8e6a27d98a1f266ad9093f095fef80881f22de  .specify/sprints/sprint-13/attestations/PG-016/context_ack.json
05429c875d501ca93d5487a108942fecdb21db2385e349be854bb5acf6828818  apps/web/src/app/(public)/signup/success/page.tsx
70c73986ffbea04ea123d5e86320b07a470802fa3465097d8465c71dd5523746  apps/web/src/components/shared/onboarding-flow.tsx
b36f64db76396e0e7b1968a6b6b4477599186c8791be9dfb1802cfcc53e46a3e  apps/web/src/lib/shared/tracking-pixel.ts
6b74a7041135bdc7e3c9d4866267159b0d75de5478a211a98a0b1d9b99ea0e68  .specify/sprints/sprint-13/attestations/PG-017/context_ack.json
129c5ae5710ed251aaaee871135f32cf7891f6ba20e6804abf8fe20c2a7dae0c  .specify/sprints/sprint-13/attestations/PG-017/attestation.json
2c0881d70ca1c54cec9f62afe403faaa22c471688222a767ea1cb8908484e493  apps/web/src/app/(public)/logout/page.tsx
b80322cd7712d5acdb15b55b9c1a509b7dee4381e7d144ebfc39f9d2baecbc67  apps/web/src/lib/shared/session-cleanup.ts
55dbb73c52d7170db4e52d6ea27931331a01520963092d310d3ed033df13a586  apps/web/src/lib/shared/logout-redirect.ts
0d306518e5334d2beb91e570a2cb3f592108ff24f0ecff97d993f4c2586b5afb  apps/web/src/hooks/useLogout.ts
e371b466c6a26645625321aae6dc15d2dfec3396767835d2bff693362a172d2e  apps/web/src/hooks/useUnsavedChanges.tsx
9885e134e385870cfb6a7be30f1e311a11c0bcb8a43923a004f1cc9cbee60816  apps/web/src/lib/broadcast.ts
fdc54e9459f9fe96e79e8f5873c5a183b987c55cc3ebff7bbd4c903efadc24f5  apps/web/src/components/auth/logout-button.tsx
a897b5d784e96db3fc9f17ca362e1ab85359c9658be1255da6defffcb8ad0e96  apps/web/src/components/auth/unsaved-work-modal.tsx
ea255df33de30275e81d249d7ced34dd386ac46b0161a6410bbfe87550b79ded  .specify/sprints/sprint-13/execution/PG-018/20260126-000000/PG-018-delivery.md
9640170198d39ef849c891f3d4c4f4da11d5cef75f13505726114d97f70b765e  apps/web/src/app/(public)/forgot-password/page.tsx
1b698c63e803f070764fddce618cc2fa1e57777d2a20b4a7813f8084c9cf4465  apps/web/src/components/shared/reset-email.tsx
59fa89e91e4ed805d8d899c04c33a0ed9df2724adab73bd891f648193ee43947  apps/web/src/lib/shared/reset-token.ts
1a70c473bfd3528187abf3f0bf25be3a0ac500c24ee70827d588fe7be2b0a7d6  .specify/sprints/sprint-13/attestations/PG-019/context_ack.json
2e5b8516a80a1e30eb98a65fc02e463672871a0ee2508b7c47ea4781a98c605a  apps/web/src/app/(public)/reset-password/[token]/page.tsx
c7acbd81e4b5e54985041a807665f9fb78aa9854ef5d2e336bbb7f3e998e35e5  apps/web/src/components/shared/password-reset.tsx
eee777b7f28389207a0a3fd62f40cb52267a2ddfac4e4c407b8230b370346024  apps/web/src/lib/shared/password-validation.ts
3cac87fce90d36a158c4833973388ce6540575d0c539d4b999d74952f5762edf  .specify/sprints/sprint-13/attestations/PG-020/attestation.json
fa05071611c0f5ef4400cc160f4aa2acd5fc3c6bc4ec118179cc48e50303d5e6  apps/web/src/app/settings/security/mfa/page.tsx
69288fbe6854e3ef7dea059c599bc3216dc64d33c9c4f5c14af61f8573846dbd  apps/web/src/components/shared/mfa-qr-generator.tsx
6d9c43b73904e6286aaa621296b24f72b0be90ca683a5e43503e0226b4bae58b  apps/web/src/lib/shared/backup-codes.ts
c87e7ccff34f0375ebe288609228df6878a702643ec19907c6228e0395912611  .specify/sprints/sprint-13/attestations/PG-021/context_ack.json
41698b26b8d9d4e2377955203b65c4c97a2cddabd6a0f57246aedc8606113619  apps/web/src/app/(public)/mfa/verify/page.tsx
4912fa293e0c216adefc7758908dd913e05e43a8a46cfc9701a21dae5252bf92  apps/web/src/components/shared/mfa-verification.tsx
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
df82f9badfd16eb365a6a270706d611d25c278b75fcc37a9cc8258dfa33b52cd  .specify/sprints/sprint-13/attestations/IFC-159/IFC-159-context_ack.json
9a32d1c6548da3e38eb556a00fc63d51f40d11649ac83dffd328c0a31be19901  apps/workers/events-worker/src/main.ts
f029b4fc639b0f3f3a33624946df01a15fa69c46ded5e24fb2c50e4bec794f30  apps/workers/events-worker/src/outbox/pollOutbox.ts
8333c3b603d43205af675b7b02493f9be868ca4507d0d93d545c35c3393cc491  apps/workers/ingestion-worker/src/main.ts
419c51faed5e31b5e219e7b9ffb3ad8aa00d0c95f6d4b529cdf639650cbf07db  apps/workers/ingestion-worker/src/jobs/extractText.job.ts
109489f948ea9e04c86c5e9830580469faabf6511d04f74abce7dd57e837df03  apps/workers/notifications-worker/src/main.ts
f96edcb1508a64dc85c1e418f6ac8e23cfbccc33bf8fd5cd838bf42377a35014  apps/workers/notifications-worker/src/channels/email.ts
580ae1706c1db33cfbee63d8b07d70b58fafee8b2fd4613001816d6825d824c8  infra/monitoring/dashboards/workers.json
d290641c28e0d91bd6b3c61634cc828523d1d35f057b112ae0e6cda598383a8b  docs/operations/workers-runbook.md
ae530265d9096e2fbcda9ac84a695acf6b655fd24ecb3a7f495bafc3650c9e8e  .specify/sprints/sprint-13/attestations/IFC-163/IFC-163-context_ack.json
8c51f08ad0af1e25e4e5420ae3921f84a5bf20df099ebe3a18a2f437ddceadba  packages/adapters/src/calendar/microsoft/client.ts
8ee63885082eed73218f58bf6e005bfa55c30bac0a6aa2f42214a3846b12fd8d  packages/adapters/src/calendar/microsoft/__tests__/client.test.ts
30e26fe4ec70a9abbbabb4fd52c9c44dae911b546f14f1fe11c6b2d6b6924a13  .specify/sprints/sprint-13/attestations/IFC-172/context_ack.json
1a94a37f6236e82e5b4f3bcee4b9d9d60bf2c0cc9dcd0f41a322d0ad760808d4  docs/planning/adr/ADR-024-scheduling-calendar.md
b1c8ea6dd8248d74468b2b3449dc7ff6c1acb7a7f6c6d0d3ff61dfe50bb47368  docs/planning/prd-scheduling-calendar.md
41d90630d2c7d714f3dfe50f4176ab32d3b5ef65164e1bd82ab7cd41799cd626  packages/adapters/src/messaging/email/inbound.ts
feaaad46baf3f5c4ea547421414f9343db5f3be0b645b1885f723b66c0d30076  apps/api/src/modules/email/inbound.router.ts
220212c3e7a6009e1d2c1ff7c377a6dbff06a4a0e6fcdea1df9301d1a25a84d4  .specify/sprints/sprint-13/attestations/IFC-173/context_ack.json
d1e7c9d7d10b2cc48ca9a118aab23d573db28628503a4ae13b6b33dc1ae8d67a  docs/planning/adr/ADR-023-communications-inbox.md
a84daec917f9ff17c37e84f73cb87aa83eab79c6c4cf2317538ee48049e56e52  docs/planning/prd-communications-inbox.md
5c8a0cffe4cbc2181e2d5e9da5edc67e7c6f241fe0b865ab44e68e843467e80f  apps/api/src/modules/home/home.router.ts
e2294c6cc8ee5011cd7d8385ce4141eec00202119fc44f175dac315799c95f86  packages/validators/src/home.ts
f8a63c28d877d5838b9318f6766b7edff186995a148b3b939bffbdec5c66bcf3  apps/api/src/modules/home/__tests__/home.router.test.ts
65216595cc684a02a25dd39994ca605ccca8fe5ab459d18f0b1ec644fd9e2e96  docs/planning/prd-home-page.md
6d9a466095112d2edf916bc0e37c9178e89bc105e0f6d0bbceac0637b1f869ee  docs/specs/HOME-PAGE-SPEC.md
16312d9883bd9e495ee6101206e91deb2f33377c5735ded2a66e9082c0a5eed9  .specify/sprints/sprint-13/attestations/IFC-182/attestation.json
2c4c41327bd3cf50c1a66d8cb267ea4d87abe67e188fc3dca15caeb2d7adaf3a  apps/api/src/modules/notifications/notifications.router.ts
fdb19246c60f6ab84cc9ca56448e7037389fb29d0d9b17239a7af4cf520faa3c  packages/validators/src/notifications.ts
addc328e267498a814c2f0eaf83191701bbfec915a23804e1ca65369c5839382  apps/api/src/modules/notifications/__tests__/notifications.router.test.ts
d9db7701c3d2b8dd2bc53015f068ac2d391a8eef6f19f03324f517782f23c6fa  .specify/sprints/sprint-13/attestations/IFC-183/context_ack.json
b3ba5ea37fca83dc4a457035def2173d18c4b697675539ca3d14073a47119f08  apps/web/src/app/documents/(list)/page.tsx
4974a38dac14db1e50643ae489b3df2daa9753ffc3e559bc6b99509c99dad66f  apps/web/src/app/documents/[id]/page.tsx
c4cf06359b47684306dbcd803a310b07db5c63d8fd3693daee0a1765feb706e9  apps/web/src/components/documents/DocumentList.tsx
74a3e07c21ab83721cdde37363269b8fe1046a92fe50949499bb64e7a75d4033  apps/web/src/components/documents/DocumentUpload.tsx
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

*Generated by sprint-completion-auditor at 2026-02-28T20:23:47.520Z*