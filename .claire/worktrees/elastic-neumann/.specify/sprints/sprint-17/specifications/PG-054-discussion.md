# Spec Discussion: PG-054 — Acceptable Use Policy

## Session Info

| Field | Value |
|-------|-------|
| Date | 2026-04-12 |
| Agents | Frontend-Lead, Compliance, Domain-Expert, Test-Engineer |
| Rounds | 4 (Analysis, Proposal, Challenge, Consensus) |
| Result | CONSENSUS — 4/4 APPROVED |

## Key Decisions

1. **Violation tracker scope**: MVP = typed record builders only, no backend calls. Future enforcement wires these records to persistence layer in sprint 18+.
2. **Footer reachability**: Two insertion points — Legal section AND bottom bar (`PublicFooter.tsx:44-50` and `:122-140`).
3. **Lighthouse gate**: Must explicitly add `/aup` to `lighthouserc.js` URL list; the GATE:lighthouse-gte-90 in CSV is vacuous otherwise.
4. **Sitemap count**: TC-25 at `sitemap-reconciliation.test.ts:32` = 194; adding page → 195.
5. **Content file name**: `docs/shared/aup-content.md` (matches existing `privacy-content.md`, `terms-content.md` naming pattern).

## Round Summaries

### Round 1: ANALYSIS
All agents confirmed PG-050 dependency is complete. Legal infrastructure fully in place. Footer gap and Lighthouse gap identified as blockers if not addressed.

### Round 2: PROPOSAL
Frontend-Lead proposed exact pattern reuse from `privacy/page.tsx`. Compliance proposed `violation-tracker.ts` structure matching `acceptance-tracker.ts`. Domain-Expert confirmed localStorage-first MVP. Test-Engineer identified 5 new files and 4 modified files.

### Round 3: CHALLENGE
Compliance raised scope risk on enforcement API — mitigated by explicit spec constraint. Test-Engineer raised Lighthouse URL gap — mitigated by adding to `lighthouserc.js`. No route conflict found.

### Round 4: CONSENSUS
4/4 agents approved the proposal. No unresolved dissenting views.
