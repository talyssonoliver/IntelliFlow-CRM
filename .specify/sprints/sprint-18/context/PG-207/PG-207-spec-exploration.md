# PG-207 spec exploration (Phase 0.75)

2026-10-20. Four `Explore` subagents ran in parallel against the worktree at
base `3d285c261`. Each one read its agent file and used Read/Grep/Glob tools;
every finding below carries the file:line the agent cited. Owner rulings that
this exploration triggered are in `PG-207-owner-ruling.md` (Q1-Q5).

## E-FE: Frontend-Lead

- F1. Both routes are "coming soon" stubs with no data:
  `apps/web/src/app/email/email-settings/page.tsx` (18 lines),
  `apps/web/src/app/email/signatures/page.tsx` (16 lines).
  `/email/templates/page.tsx` is the same stub (PG-085's scope, untouched).
- F2. Type-list pattern (fits signatures):
  `apps/web/src/app/contacts/(list)/contact-types/page.tsx:9-18` (server page +
  Suspense), `ContactTypesContent.tsx:12-17` imports (`@intelliflow/ui`,
  `useRequireAuth`, `@/lib/trpc`, `PageHeader`, `SectionHeader`), grid `:178`,
  card + SectionHeader `:179-198`, error `role="alert"` + Retry `:137-149`.
- F3. Form-settings pattern (fits email-settings): `ModuleSettingsShell`
  (`apps/web/src/components/shared/module-settings-shell.tsx:43-79`), consumer
  `apps/web/src/app/cases/(list)/case-settings/CaseSettingsContent.tsx:7,266`.
- F4. Email layout: `apps/web/src/app/email/layout.tsx:9-11` →
  `_layout-shell.tsx:27-37` (settings-mode sidebar), children inside
  `<main id="main-content">` with no padding or scroll container (`:52-61`): new
  pages bring their own `overflow-y-auto` + padding. Breadcrumbs come from each
  page's PageHeader.
- F5. `EMAIL_SETTINGS_ITEMS`
  `apps/web/src/components/sidebar/configs/email.ts:9-13`; second copy with
  descriptions `apps/web/src/components/email/EmailSettingsPanel.tsx:8-30`
  (description "Defaults, sync & display" at `:12` to be updated). Both routes
  are already reachable from the sidebar.
- F6. Shared components: `password-input.tsx`, `variable-picker.tsx`,
  `page-header.tsx`, `section-header.tsx` in `apps/web/src/components/shared/`;
  `switch`, `input`, `select`, `textarea`, `dialog`, `alert-dialog`,
  `confirmation-dialog`, `rich-text-editor` (TipTap,
  `packages/ui/src/components/rich-text-editor.tsx:11-12`) in `packages/ui`.
  Compose uses its own contentEditable `RichTextBody`
  (`apps/web/src/components/email/EmailCompose.tsx:74,517-529`). Web sanitiser:
  `isomorphic-dompurify` (`apps/web/package.json:52`; used
  `EmailCompose.tsx:4,99,319`).
- F7. EmptyState `signatures` entity copy is about e-signatures ("Request a
  signature",
  `packages/ui/src/components/entity-empty-state-config.ts:358-363`): pass a
  custom title/description.
- F8. No route overlap: no `/settings/email`, no SMTP/IMAP/signature UI anywhere
  else in `apps/web/src/app`.
- F9. Registries: sitemap `docs/design/sitemap.md:219-220,448`; reachability
  `navigation-reachability-audit.md:296-297`; `PAGE_MAP_AND_FLOWS.md:248-249`;
  page-registry Section 13 has no rows for these routes (`:1214-1231`);
  ui-flow-mapping has none (`:423-424`, `/email/*` "Hardcoded" `:802,827`);
  content-audit has none.

## E-BE: Backend-Architect

- B1. Newest router pattern:
  `apps/api/src/modules/contact/contact-types.router.ts` — `tenantProcedure` +
  in-handler admin check `assertContactTypeAdmin` (`:317`, roles
  `ADMIN/MANAGER/OWNER/SUPER_ADMIN`
  `packages/domain/src/crm/contact/contact-type-defaults.ts:45-51`),
  `ctx.prismaWithTenant` with explicit `tenantId` (`:9-11,133-135`),
  `$transaction` (`:322,390,448,490`), P2002→CONFLICT
  (`contact-type-resolver.ts:126-130`), fire-and-forget audit
  `getAuditLogger(ctx.prisma).logAction` (`:217-222`). Registration
  `apps/api/src/router.ts:198` (`email: inboundEmailRouter`). Procedure smoke
  test `apps/api/src/__tests__/app-router.smoke.test.ts:122-159`.
- B2. Email models `packages/db/prisma/schema.prisma:3934-4010`;
  `EmailRecord.bouncedAt` `:3972`, `metadata` `:3980`, `EmailStatus.BOUNCED`
  `:3999-4007`. No signature, SMTP or suppression model; no settings JSON on
  Tenant (`:20`).
- B3. Migration shape:
  `packages/db/prisma/migrations/20261017120000_contact_types/migration.sql`
  (named CHECKs `:46-61`, lower(name) unique `:77-84`, composite tenant FKs
  `:87-95`, RLS policy block `:97-115`). Export allowlist
  `packages/db/src/index.ts:23-106`.
- B4. `sendEmail` `apps/api/src/modules/email/inbound.router.ts:663-787`: from =
  `ctx.user.email` or a platform noreply (`:689`); writes `EmailRecord` via
  `ctx.prisma` (`:705`); calls a module-level singleton `outboundEmailService`
  (`:34-44`, SendGrid key only, never Resend) without
  `replyTo`/`trackOpens`/`headers` (`:742-752`).
- B5. `createOutboundEmailService`
  `packages/adapters/src/messaging/email/outbound.ts:624-654` (Resend → SendGrid
  → Mock); SendGrid maps `reply_to` and `open_tracking`/`click_tracking`
  (`:377,394-397`); Resend maps `reply_to` and headers (`:463,466`) and ignores
  tracking. No SMTP code anywhere; root `package.json:254` pins
  `"nodemailer": ">=10.0.9"` as an override only; ADR-041 names SMTP as a
  fallback option
  (`docs/architecture/adr/ADR-041-email-outbound-provider.md:38,46`).
- B6. Bounces: `EmailWebhookEvents.BOUNCED` constant only
  (`apps/api/src/webhooks/handler.ts:588`); nothing writes `bouncedAt` or
  `BOUNCED`; both providers' `checkBounce` return null
  (`outbound.ts:417-420,495-498`); the `email.webhook` procedure handles inbound
  mail only (`inbound.router.ts:273`, HMAC `:239-249`).
- B7. Tracking: no open-pixel endpoint (IFC-221 Backlog, `Sprint_plan.csv:468`);
  only SendGrid's own `open_tracking` works today.

## E-SEC: Security-Lead

- S1. `/// @encrypted` is documentation only: the bespoke extension encrypts
  only fields in `ENCRYPTED_FIELDS`
  (`packages/db/src/field-encryption.ts:33-35,222-264`). Applied by
  `createPrismaClient` (`packages/db/src/client.ts:157-162`);
  `ctx.prismaWithTenant` extends that client
  (`apps/api/src/security/tenant-context.ts:177-193,268`). With no
  `PRISMA_FIELD_ENCRYPTION_KEY` it silently stores plaintext
  (`client.ts:160-162`). Decrypts on `find*` only
  (`field-encryption.ts:233-239`).
  `packages/db/src/__tests__/field-encryption.test.ts:63` asserts the annotation
  count (must be bumped).
- S2. Write-only secret precedent:
  `apps/api/src/modules/custom-action-handler/custom-action-handler.router.ts`
  (`redactAuth` `:55-57`, `hasAuthHeader` `:78`, update only when sent `:134`).
- S3. SSRF: `isPublicIpAddress`
  (`packages/domain/src/workflow/node-catalog.ts:581-624`) and DNS pinning
  `resolveAndPin`
  (`apps/api/src/workflow/dispatchers/custom-action-dispatcher.ts:35-80`). No
  port allow-list exists.
- S4. RBAC: `adminTenantProcedure` (`apps/api/src/trpc.ts:567-571`) lacks the
  CSRF/rate-limit middleware of `protectedProcedure` (`:244-249`); newest
  routers use `tenantProcedure` + in-handler role check (B1). Several older
  settings routers write with plain `tenantProcedure`
  (`account-settings.router.ts:123,294`) — not to be copied.
- S5. No server-side HTML sanitiser; `sendEmail` passes raw `htmlBody`
  (`inbound.router.ts:670,708,750`).
- S6. Audit logging keeps free text out (`account-tiers.router.ts:115-137`);
  rate-limit tiers `trpc.ts:237,587-594`.
- S7. Secret-scan rules a fixture could trip: `password-literal`,
  `password-fragments`, `uri-credentials` (`.gitleaks/shared.toml:17-46`); only
  filler such as `'x'.repeat(n)` passes (`:85-92`).

## E-DOM/TEST: Domain-Expert + Test-Engineer

- D1. PRD addendum shape `docs/planning/prd-module-settings.md:806-876` (US-/AC-
  prefixes, Boolean toggles table, delivery status). PG-207 uses `US-EM*` /
  `AC-EM-*`.
- D2. Email dependency chain exists
  (`docs/architecture/diagrams/complete-dependency-chains.md:653-690`); module-
  settings sections like PG-205's `:2492-2528`.
- D3. Dependencies: PG-178 COMPLETE (`leadSettings`
  `apps/api/src/router.ts:146`; TS gate oddity exit 1/passed true at
  `.specify/sprints/sprint-16/attestations/PG-178/attestation.json:18-24`,
  re-run 2026-10-07 exit 0). PG-182 COMPLETE (`$transaction`
  `contact-settings.router.ts:92,117,158,176`; `contactSettings`
  `router.ts:12,147`).
- D4. Test patterns:
  `apps/api/src/modules/contact/__tests__/contact-types.router.test.ts`
  (`$transaction` mock `:90`, role contexts `:91-97`, FOREIGN id `:32`, strict
  input `:296-298`); integration `tests/integration/contact-types.test.ts`
  (re-applies migration SQL `:60-68`, RLS check `:370-394`); web
  `ContactTypesContent.test.tsx` (axe-core `:7`, trpc mock `:69-87`).
- D5. `sendEmail` tests mock `createOutboundEmailService` at module level
  (`apps/api/src/modules/email/__tests__/inbound.quota-guard.test.ts:10-19`,
  `inbound.router.b11.test.ts:22-29`): a per-tenant transport must keep those
  mocks working.
- D6. ADR: highest on main is ADR-081; the runner allocated **ADR-085** to
  PG-207 (082/083/084 are held by PG-199/PG-203/PG-208).

## Discrepancies vs the row / summaries

- Row says SMTP/IMAP config; reality: no SMTP/IMAP code exists (owner ruling Q1:
  store + send via SMTP).
- Row says bounce handling rules; reality: no bounce ingestion exists (owner
  ruling Q3: wire it now).
- Red flag (pre-existing, adjacent): `sendEmail` builds its service with the
  SendGrid key only, so with no `SENDGRID_API_KEY` it falls back to the mock
  provider even though Resend is the configured stack provider (B4/B5).
