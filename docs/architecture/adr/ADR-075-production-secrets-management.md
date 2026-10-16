# ADR-075: Production secrets management — Terraform/HCP + Railway native env store, no separate Vault

**Status:** Accepted

**Date:** 2026-10-12

**Deciders:** Talysson Oliveira (Owner)

**Technical Story:** IFC-317 (filed as issue #317; see also #312, #333)

## Context and Problem Statement

Issue #317 was filed on 2026-06-07 as "**ADR-065**: decide Vault-as-SSOT vs HCP
vs native env stores for production secrets." The very next day (2026-06-08, PR
#333) `ADR-065` was permanently claimed by an unrelated decision — "CRM → Portal
delivery & billing sync" (`ADR-065-crm-portal-delivery-sync.md`, Technical Story
IFC-314) — which has since shipped and must not be overwritten.
`docs/architecture/adr/README.md`'s own numbering convention ("Future ADRs use
IDs 066+") plus the files actually on disk (ADR-066 through ADR-074 already
exist) make **ADR-075** the real next free number. This ADR records the
2026-10-12 owner decision under its correct number; `#317` and the operations
doc below keep the stale "ADR-065" label only as a historical pointer to this
file.

The actual problem, from
`docs/operations/credential-coverage-remediation-2026-06-07.md` and the code it
audited: production secrets are split across Terraform/HCP sensitive vars,
Railway's/Vercel's native env stores, and an optional Vault Transit backend for
field-encryption keys. `VAULT_ENABLED` (checked in
`apps/api/src/security/encryption.ts:456-458`) gates whether
`getEncryptionService()` builds a `VaultKeyProvider` (`:156-202`) or falls back
to `EnvironmentKeyProvider` (`:100-152`); it defaults to **off**, i.e. the
environment-variable DEK path, today. `VAULT_TOKEN` / `VAULT_LOCAL_DEK_SECRET`
are therefore the DEK **seed value** for that fallback path (runtime-required
when a DEK exists at all), not credentials for a production Vault cluster — no
such cluster has ever been deployed. Conflating "finish wiring `VAULT_*` into
HCP" with "stand up Vault as the secrets-management system of record" has
blocked clean credential management since the June audit.

## Decision Drivers

- **Unblock now vs. build infrastructure that doesn't exist yet.** HCP sensitive
  vars (Terraform-managed) and Railway's native env store already hold every
  other production credential (see the credential matrix in the 2026-06-07
  remediation doc); adding a dedicated Vault cluster, VSO/agent injection, and
  its own operational burden is a separate, much larger decision with no current
  driver.
- **Don't let a field-encryption detail dictate the secrets-management
  architecture.** `VAULT_*` is one optional DEK provider for one subsystem
  (field encryption), selected per `VAULT_ENABLED`. It should not gate the ADR
  that decides where _every_ production secret lives.
- **Terraform stays the infra source of truth** (ADR-064) — secrets that
  Terraform can own (HCP sensitive vars, synced into `shared_env_vars`/service
  env blocks) should stay on that path rather than split across a second system.
- **Railway-native values stay native.** Values Railway itself generates or
  manages operationally (service-to-service URLs, some platform-level settings)
  are cheaper and safer left in Railway's own store than mirrored into
  Terraform.

## Considered Options

- **A — HCP sensitive vars (Terraform) + Railway/Vercel native env stores, no
  separate Vault.** Keep today's two-system split, close the Tier-0/Tier-1 gaps
  the audit found, and leave `VAULT_ENABLED` as an optional field-encryption
  toggle for a future Vault Transit deployment if one is ever justified.
- **B — Stand up a production Vault cluster as the single source of truth** for
  all secrets (VSO or agent injection into Railway/Vercel). Centralizes secret
  policy and rotation, but is new infrastructure with no current operational
  owner, and would still need a migration plan off HCP/Railway native for every
  existing credential.
- **C — Move everything into Railway's native store only**, dropping Terraform
  management of secrets. Rejected outright: it would make HCP secret state and
  the deployed environment diverge silently, the opposite of ADR-064's
  Terraform-SSOT goal.

## Decision Outcome

Chosen option: **A — keep production secrets in Terraform/HCP sensitive vars
plus Railway's native env store; no separate Vault.**

This is the owner's 2026-10-12 decision, recorded verbatim in issue #317:

> "Owner decision 2026-10-12 (ADR-065): keep production secrets in Terraform/HCP
> sensitive vars plus Railway's native env store. No separate Vault."

Vault-as-SSOT (a real production Vault cluster with VSO/agent injection) is
explicitly **deferred, not rejected forever** — it is simply not the chosen
architecture today, and nothing in this decision blocks revisiting it later if a
concrete driver (e.g. a compliance requirement, multi-cloud secret sharing)
appears. `VAULT_ENABLED`/`VaultKeyProvider` remain in the codebase unchanged as
the optional field-encryption DEK path; that is an implementation detail of
`EncryptionService`, not this ADR's scope.

### Positive Consequences

- Unblocks the deferred Tier-0/Tier-1 remediation in
  `docs/operations/credential-coverage-remediation-2026-06-07.md` (seven
  boot-crash secrets, ten name-contract mismatches) without waiting on new
  infrastructure.
- No new operational surface (Vault cluster, unseal/rotation procedure,
  VSO/agent) to run, patch, or be paged for.
- Matches ADR-064 (Terraform = infra SSOT): secrets Terraform can own stay on
  that path; Railway-native values stay native. One rule, not a case-by-case
  split.

### Negative Consequences

- No centralized secret-rotation policy or audit trail spanning both systems —
  HCP and Railway each have their own. Acceptable today because secret rotation
  volume is low (`secret-rotation.yml` already runs nightly against the current
  two-system split).
- If a future requirement needs a real secrets-management system (dynamic
  leases, fine-grained per-service policy), this ADR will need to be revisited
  rather than extended.

## Links

- Decided in:
  [#317](https://github.com/talyssonoliver/IntelliFlow-CRM/issues/317)
- Refines: [ADR-064](./ADR-064-terraform-single-source-of-truth.md) (Terraform =
  infra SSOT)
- Does NOT refine/replace: [ADR-065](./ADR-065-crm-portal-delivery-sync.md) (CRM
  → Portal delivery sync, IFC-314) — unrelated decision that permanently claimed
  the "065" number one day after #317 was filed under that working title.
- Context: `docs/operations/credential-coverage-remediation-2026-06-07.md`
  (credential matrix, Tier-0/1/2 remediation plan), issue #312 (serverless
  `connection_limit` / transaction-pooler `DATABASE_URL`)
- Code: `apps/api/src/security/encryption.ts` (`EnvironmentKeyProvider`,
  `VaultKeyProvider`, `getEncryptionService()`)

## Implementation Notes

No code change is required by this decision — it ratifies the status quo
(`VAULT_ENABLED` already defaults off) and closes the open question that was
blocking the Tier-0/Tier-1 remediation plan. Follow-up work (tracked separately,
not by this ADR):

- Close the seven Tier-0 gaps in the credential-coverage-remediation doc by
  adding the missing HCP sensitive vars, then run the deferred
  `terraform apply`.
- Fix the ten Tier-1 name-contract mismatches (email 5, SMS 3, DB pool 2).

### Validation Criteria

- [x] Owner decision recorded verbatim, with date, in this ADR and in #317.
- [x] Decision outcome does not require creating new infrastructure (no Vault
      cluster to provision).
- [x] `VAULT_ENABLED`/`VaultKeyProvider` code path left untouched — this ADR is
      about which system is the secrets SSOT, not about field encryption.
- [ ] Tier-0/Tier-1 remediation from the 2026-06-07 audit actually applied
      (separate follow-up work, not gated on this ADR).

### Rollback Plan

If Option A proves insufficient (e.g. a compliance driver requires a real
secrets-management system), supersede this ADR with a new one proposing Option
B, and migrate secrets off HCP/Railway-native incrementally per credential tier
(Tier-0 first) rather than a big-bang cutover.
