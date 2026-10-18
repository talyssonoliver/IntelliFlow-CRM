# Step 15: /simplify review (recovery lane, 2026-10-17, after 21:27:35Z; committed 75bec9439 at 21:38:17Z)

Four parallel Explore sub-agents (reuse, simplification, efficiency, altitude) reviewed
`git diff origin/main...HEAD -- apps packages`.

## Applied (no behaviour change; api contact module 398/400 pass, 2 skipped; application ContactService 101/101; web list 11/11)

- `ContactService.associateWithAccount` / `replaceAccount` share one private `changeAccount` (removed ~40 duplicated lines).
- `contact.router.ts`: `handleDisassociateAccount` uses `throwAccountChangeError`; the dispatcher
  `applyContactAccountChange` + closure called twice is replaced by `handleLinkOrReplaceAccount` (before the
  field save) and an unlink after it. One existing suite caught a drift (unlink when the stored account is
  unknown); the original condition `storedAccountId !== null` was restored.
- `prismaCode` lives once, exported from `contact-type-resolver.ts` (the router copy is removed).
- `assertContactTypeOnUpdate` returns before the type lookup when no field a type can require changes
  (one query fewer on most updates). The test is updated to the new contract and a new test covers the lookup path.
- Stranded JSDoc blocks moved (resolver update rules) or merged (router `assertTagsAvailable`).
- `typeOptions` memoised in `ContactsPageClient`.

## Skipped (with reason)

- Shared PG-204/PG-205 components (delete dialog, loading skeleton, content shell, colour picker, validators name
  check): cross-module refactor of merged PG-204 code. Recorded as accepted near-duplication in the findings doc.
  Sonar duplication is checked at Step 20.
- Single save for fields and account, and URL-as-source-of-truth for list filters: deeper redesigns outside L1.
  The two-save ordering is recorded in the findings doc.
- `ensureSystemContactTypes` per-call count, the key re-issue loop, and count+findMany in create: rare or tiny
  costs, and the tests pin the current queries.
- Badge-class map shared with TagsTab: would touch a file outside the diff.
- The rbac.ts matrix is not enforced for contact_type: it follows the PG-204 case-types convention.
