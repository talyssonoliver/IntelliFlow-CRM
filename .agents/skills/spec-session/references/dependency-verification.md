# Spec Session — Dependency Verification

## Phase 0.9: Dependency Chain Verification (MANDATORY)

Verify dependency chain diagram exists for the entity/feature being specified.

1. Identify entity/feature
2. Read relevant chain file from `docs/design/diagrams/`
3. Verify layer alignment (domain → validators → application → database → adapters → API → UI)
4. Check task ID appears in the chain

If chain is missing: create it following existing templates.

## Phase 0.92: UI Reachability Verification (MANDATORY for UI tasks)

**Applies to**: Any task creating or modifying a page/route (`PG-*` tasks, or `IFC-*` tasks with UI layer).
**Skip for**: Backend-only, domain, validator, or infrastructure tasks.

**Why**: A page with no sidebar/nav entry is unreachable. PG-030 shipped a complete subscription manager behind a URL with zero navigation links — only discoverable by typing `/billing/subscriptions` directly.

### Steps

1. **Identify the route** — What URL will this page live at? (e.g., `/billing/subscriptions`)
2. **Check sidebar configs** — Read `apps/web/src/components/sidebar/configs/` for the relevant section (e.g., `billing.ts` for `/billing/*` routes)
   - Does an entry exist for this route? If not → this is a finding.
3. **Check parent pages for links** — Are there any `<Link>` or navigation elements in parent/sibling pages that point to this route?
4. **Check breadcrumbs/back-links** — Does the layout or page include breadcrumb navigation?
5. **Report findings**:

| Route | Sidebar Entry | Parent Link | Breadcrumb | Reachable? |
|-------|--------------|-------------|------------|------------|
| `/billing/subscriptions` | NONE | NONE | NONE | NO |

**If the page is NOT reachable:**
- The spec MUST include an acceptance criterion for adding a navigation entry
- The spec MUST specify WHERE the link goes (sidebar config file, parent page, or both)
- Do NOT proceed to consensus with an unreachable page — this is equivalent to a missing dependency

## Phase 0.95: Dependency Deep Verification (MANDATORY)

**Static CSV status checks are NOT sufficient.** Before specifying a task, verify that each dependency ACTUALLY delivered what it claimed.

**Why**: A dependency may be marked "Completed" in Sprint_plan.csv but its attestation may contain false claims (e.g., "service wired in container" when it wasn't). Building a spec on top of a broken dependency wastes the entire spec→plan→exec cycle.

### Steps

1. **Read each dependency's attestation** at `.specify/sprints/sprint-{N}/attestations/<DEP_ID>/attestation.json`
2. **For each `definition_of_done_items` where `met: true`**, verify the claim:
   - "Service wired in container" → **Read `apps/api/src/container.ts`** and confirm the service is instantiated
   - "Repository created" → **Glob for the file** and verify it exports a class
   - "tRPC router registered" → **Read `apps/api/src/router.ts`** and verify the router is merged
   - "Prisma model created" → **Read `packages/db/prisma/schema.prisma`** and verify the model exists
   - "Tests passing" → **Run the test command** from the attestation
3. **For API/backend dependencies**: Verify the service is accessible at runtime:
   - Check `apps/api/src/container.ts` for service instantiation
   - Check `apps/api/src/context.ts` for service mapping (NOT optional/planned)
4. **Report findings** in the spec under a "Dependency Verification" section:

| Dependency | Claim | Verified | Method |
|-----------|-------|----------|--------|
| IFC-086 | ChainVersionService wired | FALSE | container.ts — not instantiated |
| IFC-002 | Domain model created | TRUE | Lead.ts exists with all fields |

**If ANY dependency claim is FALSE:**
- **STOP** — Do not proceed with spec generation
- Document the false claim and what needs to be fixed
- The dependency task must be reopened and fixed first

## Follow-Up Task Creation (when dependency claim is FALSE)

When a dependency claim fails verification:

1. Run the **anti-spam checklist** from `full-pipeline/references/follow-up-task-protocol.md`:
   - Search codebase — does the issue actually exist?
   - Search Sprint_plan.csv — is there already a task for this?
   - Is this within current task's scope? If yes, fix it now
   - Is the issue real and reproducible?
2. If checklist passes, invoke `/create-task` with:
   - Title: `Fix false attestation claim in {DEP_ID}: {claim description}`
   - Description: Include the verification table showing FALSE claims, with `source_task: {TASK_ID}`, `source_phase: spec`, `blocking: true`
   - Dependencies: none (it fixes an existing task)
   - Blocking: true (current task cannot proceed)
3. Record in follow-ups sidecar JSON at `.specify/sprints/sprint-{N}/follow-ups/{TASK_ID}-follow-ups.json`
4. **STOP** with message: `Blocking follow-up {NEW_ID} created for {DEP_ID} false claim`
