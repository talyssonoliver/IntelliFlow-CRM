# PG-196 — open question for the owner (spec-session paused, 2026-10-06)

The spec cannot be written until the owner picks a tier model. Do not guess;
do not re-run the spec rounds until this file records an answer.

## The conflict

- The CSV row asks for **bronze/silver/gold/platinum** tiers with **point
  thresholds**, a benefits matrix, a default tier and upgrade/downgrade rules.
- The codebase already has a canonical tier vocabulary, and it is different:
  `packages/domain/src/crm/account/Account.ts:17` defines
  `ACCOUNT_TIERS = ENTERPRISE | MID_MARKET | SMB | STARTUP | UNKNOWN`, classified
  by hard-coded **annual revenue** bands in `getAccountTier()` (IFC-273).
  It is used by `apps/web/src/components/accounts/AccountCard.tsx:120`, the
  Account Settings hierarchy tab (`requireParentForTiers`, with options
  `enterprise/mid-market/smb/startup`), and the accounts sidebar
  (`apps/web/src/components/sidebar/configs/accounts.ts`, "Account Tiers"
  section linking to `/accounts?tier=…` — no code reads that `tier` param, so
  those four links are dead filters today).
- No "points" concept exists on Account. The nearest thing is `Account.score`
  (IFC-312 AI score).

## Options put to the owner

- **A (recommended)** — make the existing revenue tiers tenant-configurable on
  this page: tier names, revenue thresholds, colour, benefits, default tier, and
  rules for moving between tiers. `getAccountTier` reads the tenant's config;
  the card, hierarchy tab and sidebar use it, and the dead sidebar filters get
  wired. One tier system. The row's DoD wording changes from
  bronze/silver/gold/platinum + points to revenue bands.
- **B** — build the row as written: a second, points-based
  bronze/silver/gold/platinum tier system, with points taken from
  `Account.score`. Two tier systems side by side.
- **C** — something else.

## Answer

**A** — Talysson, 2026-10-07 (via modal), verbatim ruling:

> A. The page lets each tenant configure the existing revenue tiers
> (ENTERPRISE/MID_MARKET/SMB/STARTUP vocabulary as the starting set): names,
> revenue thresholds, colour, benefits, default tier, up/down rules. The account
> card, the Account Settings hierarchy tab and the sidebar tier links all read
> that one configuration, and the dead /accounts?tier= sidebar filters get fixed.

Consequences: one tier system (no bronze/silver/gold/platinum, no points);
Sprint_plan.csv PG-196 DoD reworded to revenue bands (Category-C change
authorised by the owner here); spec rounds may proceed.

## 2026-10-06 22:2xZ — second spec attempt (ralph loop) re-checked and stopped

Re-verified the conflict against the tree: `Account.score` is `Int?` 0–100,
written only by `apps/ai-worker/src/account-scoring.chain.ts` (AI is opt-in,
default off), so under option B most tenants' accounts would sit in the
default tier. Still no answer recorded; spec rounds NOT re-run. Ralph loop
state set `active: false` so it does not spin on the pending answer.
