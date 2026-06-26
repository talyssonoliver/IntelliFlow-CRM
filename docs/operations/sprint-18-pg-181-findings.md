# Sprint 18 — PG-181 Help Article Editor (findings)

Date: 2026-06-26 · Branch: `feat/pg-181` · Persona: frontend-lead
(`/stoa-domain`)

Scope: build the admin Help Article Editor at
`/settings/help-center/articles/new` and
`/settings/help-center/articles/[id]/edit` (Tiptap body, metadata, preview,
draft/publish). A pre-merge a11y-expert (WCAG 2.1 AA) review and a frontend-lead
code review were run on the diff.

## In-scope fixes applied (this branch)

- **Mapper data-loss** (`article-editor-mapping.ts`): `sectionsToDoc` keyed the
  body-paragraph emission off `content !== heading`, which dropped a legitimate
  legacy body that coincidentally equalled its heading. Re-keyed to
  blocks-presence (`hasStoredBody`) so legacy bodies are preserved and only the
  heading-only placeholder (`content === heading`, no stored blocks) is skipped.
- **Tiptap text-leaf misclassification** (`isLegacyBlock`): a `{type:'text'}`
  node carries a top-level `text` field; guarded so only non-text nodes with a
  `text` field count as legacy ContentBlocks.
- **Not-found flash** (`article-editor.tsx`): the edit-mode query is gated on
  `isPrivileged`; between the profile resolving and the query firing it was
  neither loading nor settled, briefly rendering the not-found surface. Now
  `(!data && !error)` is treated as loading.
- **Publish status symmetry**: `handlePublish` now `setStatus('PUBLISHED')`
  (mirrors `handleUnpublish`).
- **WCAG (a11y review)**: body region is a labelled `role="group"` with
  `aria-describedby` → body error (`id="article-body-error"`); loading skeletons
  are `role="status"`; preview control is a plain action button (no
  `aria-pressed`/name clash); `<select>` uses `focus-visible`; an sr-only
  `role="status"` announces saving.

## Out-of-scope / pre-existing (tracked, NOT changed here)

Per project Rule 8 these are recorded in `artifacts/metrics/debt-ledger.yaml`
and filed as gh issues; they pre-date PG-181 (introduced by IFC-299) and were
left untouched to keep this diff minimal.

| Ledger ID                               | Issue | Severity | Summary                                                                                                                                        |
| --------------------------------------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `HELP-ARTICLE-UPDATE-RETURN-TENANT-001` | #525  | low      | `update()` final `findUniqueOrThrow({where:{id}})` lacks a `tenantId` filter (defense-in-depth; guarded by the prior tenant-scoped pre-check). |
| `HELP-ARTICLE-SLUG-EDGE-HYPHEN-001`     | #526  | low      | Shared slug regex `^[a-z0-9-]+$` permits a leading/trailing hyphen on a manually-typed slug (cosmetic).                                        |

## Notes

- The `getById` DRAFT guard is server-side (`ctx.tenant.role`), mirroring
  `getBySlug` — the client `enabled` flag is a UX optimisation, not the security
  boundary. A code-review "non-privileged can read DRAFT" flag was a false
  positive (the `!isPrivileged → NOT_FOUND` guard is present).
- PG-181 touches `apps/web` + `apps/api` only — it does **not** modify
  `packages/ui`, so the `MERGED-COVERAGE-UI-PROJECTS-EMPTY-001` ui-coverage
  dead-zone does not apply to this diff.
