# Plan Session — Dependency Chain & Deep Verification

## Dependency Chain Verification (MANDATORY)

**CRITICAL**: Before generating the TDD plan, verify the implementation order
aligns with the hexagonal architecture dependency chain.

### Why This Matters

The plan must follow the correct layer order:

```
Domain → Validators → Application → Database → Adapters → API → UI
```

Plans that skip layers or implement out of order will fail architecture tests.

### Verification Steps

1. **Read Dependency Chain** - Load from
   `docs/design/diagrams/complete-dependency-chains.md`

2. **Identify Current Layer** - What hexagonal layer does this task implement?
   - Domain (entities, value objects, aggregates)
   - Validators (Zod schemas derived from domain)
   - Application (use cases, ports)
   - Database (Prisma schema, migrations)
   - Adapters (repository implementations)
   - API (tRPC routers)
   - UI (Next.js pages, components)

3. **Check Prerequisites** - Verify all earlier layer tasks are complete (✅):
   - For Validator tasks → Domain tasks must be ✅
   - For Application tasks → Domain + Validators must be ✅
   - For Adapter tasks → Application + Database must be ✅
   - For API tasks → Adapters must be ✅
   - For UI tasks → API must be ✅ AND navigation entry must exist or be planned
     - Check `apps/web/src/components/sidebar/configs/` for a sidebar entry
       pointing to the page route
     - If no sidebar entry exists AND the spec requires one → plan MUST include
       a step to add it
     - If no sidebar entry exists AND spec does NOT mention it → **BLOCK** —
       spec is incomplete, re-run `/spec-session`

4. **Update Chain Status** - Mark task as ⏳ (in-progress) in dependency chain

### Plan Must Include

The generated TDD plan MUST include:

- **Hexagonal Layer**: Which layer this task implements
- **Dependency Chain Reference**: Link to the relevant chain diagram
- **Prerequisite Verification**: Confirmation all earlier layers are complete

## Dependency Deep Verification (MANDATORY)

**Static checks (CSV status) are NOT sufficient.** You MUST verify that
dependency tasks actually delivered what they claimed.

**Why**: A dependency task may be marked "Completed" in Sprint_plan.csv but its
attestation may contain false claims (e.g., "service wired in container" when it
wasn't). This gate catches those gaps BEFORE you build on top of a broken
foundation.

### Steps

1. **Read each dependency's attestation** at
   `.specify/sprints/sprint-{DEP_SPRINT}/attestations/<DEP_ID>/attestation.json`
   - `{DEP_SPRINT}` is the **dependency task's** Target Sprint from
     Sprint_plan.csv (NOT the current task's sprint)
   - Look up each dependency's Target Sprint independently from the CSV
2. **For each `definition_of_done_items` claim**, verify it is actually true:
   - If claim says "Service wired in container" → **Read
     `apps/api/src/container.ts`** and verify the service is actually
     instantiated
   - If claim says "Repository created" → **Glob for the file** and verify it
     exports a class
   - If claim says "tRPC router registered" → **Read `apps/api/src/router.ts`**
     and verify the router is merged
   - If claim says "Prisma model created" → **Read
     `packages/db/prisma/schema.prisma`** and verify the model exists
   - If claim says "Tests passing" → **Run the test command** from the
     attestation's `validation_results`
3. **For API/backend dependencies**: Verify the service is accessible at
   runtime:
   - Check `apps/api/src/container.ts` for service instantiation
   - Check `apps/api/src/context.ts` for service mapping to context
   - If service is `undefined` or marked as `optional`/`planned` → **BLOCK**
4. **Report findings**:

| Dependency | Claim                                  | Verified | Method                               |
| ---------- | -------------------------------------- | -------- | ------------------------------------ |
| IFC-086    | ChainVersionService wired in container | FALSE    | Read container.ts — not instantiated |
| IFC-086    | tRPC router registered                 | TRUE     | Read router.ts — chainVersion merged |

**If ANY dependency claim is FALSE:**

- **BLOCK** — Do not proceed with plan generation
- Document the false claim and what needs to be fixed
- The dependency task must be reopened and fixed first
- Update dependency's attestation verdict to `INCOMPLETE`

## Follow-Up Task Creation (when dependency claim is FALSE)

When a dependency claim fails verification:

1. **Dedup check first**: Read
   `.specify/sprints/sprint-{CURRENT_SPRINT}/follow-ups/{TASK_ID}-follow-ups.json`
   (where `{CURRENT_SPRINT}` is the **current task's** Target Sprint, not the
   dependency's) — if spec-session already created a follow-up for the same
   dependency claim, do NOT create a duplicate. Reference the existing follow-up
   ID instead.
2. Run the **anti-spam checklist** from
   `full-pipeline/references/follow-up-task-protocol.md`:
   - Search codebase — does the issue actually exist?
   - Search Sprint_plan.csv — is there already a task for this?
   - Is this within current task's scope? If yes, fix it now
   - Is the issue real and reproducible?
3. If checklist passes and no duplicate exists, invoke `/create-task` with:
   - Title: `Fix false attestation claim in {DEP_ID}: {claim description}`
   - Description: Include the verification table showing FALSE claims, with
     `source_task: {TASK_ID}`, `source_phase: plan`, `blocking: true`
   - Dependencies: none (it fixes an existing task)
   - Blocking: true (current task cannot proceed)
4. Record in follow-ups sidecar JSON at
   `.specify/sprints/sprint-{CURRENT_SPRINT}/follow-ups/{TASK_ID}-follow-ups.json`
   (current task's Target Sprint)
5. **BLOCK** with message:
   `Blocking follow-up {NEW_ID} created for {DEP_ID} false claim`
