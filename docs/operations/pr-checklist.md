# PR Checklist — IntelliFlow CRM

**Purpose**: Every pull request author and reviewer must verify this list before
merging. Non-negotiable items are marked **[BLOCK]** — a PR may not merge until
they pass. Advisory items are marked **[WARN]**.

---

## Author Checklist (complete before requesting review)

### Code Quality [BLOCK]

- [ ] `pnpm typecheck` passes (no TypeScript errors)
- [ ] `pnpm test` passes (all unit + integration tests green)
- [ ] `pnpm lint` passes (ESLint + Prettier — no suppressions without comment)
- [ ] `pnpm build` passes (full Next.js / tRPC build — do NOT skip)

### Metrics & Governance [BLOCK]

- [ ] `pnpm run validate:sprint-data -- --strict` passes when any file under
      `apps/project-tracker/docs/metrics/` is touched
- [ ] `pnpm run validate:sprint0 -- --strict` passes when governance, metrics,
      or docs are touched
- [ ] If `Sprint_plan.csv` was edited: run
      `npx tsx tools/scripts/split-sprint-plan.ts` and commit the regenerated
      split files

### Secrets & Security [BLOCK]

- [ ] No secrets, credentials, or `.env` values committed (even in test files)
- [ ] No `console.log` left that dumps sensitive data
- [ ] No hardcoded IDs, passwords, or API keys

### Tests [BLOCK]

- [ ] New code paths have tests (or PR description explains the rationale for
      deferring coverage)
- [ ] Test count is not the only coverage evidence — actual coverage % reported
      if coverage thresholds are relevant

### Documentation [WARN]

- [ ] If a new `docs/operations/` file is added: update
      `docs/operations/README.md` index table
- [ ] If a runbook is renamed or moved: update
      `infra/monitoring/alerts-config.yaml` `runbook:` URL and
      `apps/project-tracker/docs/metrics/validation.yaml`
- [ ] If a new ADR is added: listed in `docs/architecture/adr/README.md`

### Icons & UI [WARN]

- [ ] No new Lucide / Heroicons / react-icons imports — use Material Symbols
      Outlined only (see `docs/design/ICON_USAGE.md`, ADR-046)
- [ ] No inline `<svg>` zero-state illustrations — use `<EmptyState>` from
      `@intelliflow/ui` (see `docs/design/EMPTY_STATES.md`)

### Attestations [BLOCK if task has one]

- [ ] Attestation path matches
      `.specify/sprints/sprint-{TARGET_SPRINT}/attestations/{TASK_ID}/attestation.json`
- [ ] `"verdict": "COMPLETE"` (not `"status"`)
- [ ] `validation_results` array has exactly 4 entries

---

## Reviewer Checklist

- [ ] Verify the 4 mandatory validation commands actually ran (check CI or ask
      author to paste output)
- [ ] Check that no shared component was re-implemented when one already exists
      (search by function, not name — see `packages/ui/src/components/`)
- [ ] Confirm no destructive git ops were used (no `--force`, `--hard`, `-D`)
- [ ] If the PR touches `container.ts` or `context.ts`: verify the new service
      is wired and instantiated, not just imported

---

## TODO: to be authored

- Automated pre-merge CI gate linking this checklist to GitHub status checks
- Specific review SLA expectations per PR size bucket
- Escalation path when reviewer is unavailable

---

**Owner**: Engineering Lead  
**Last reviewed**: 2026-04-16  
**Related**: `docs/operations/wip-policy.md`,
`docs/operations/quality-gates.md`, `docs/operations/engineering-playbook.md`
