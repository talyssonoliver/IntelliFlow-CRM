# ADR-049: Agent Plan/Reflect Phases

**Status:** Proposed

**Date:** 2026-04-18

**Deciders:** AI Lead, Backend Lead, CTO

**Technical Story:** Agent system audit 2026-04-17

## Context and Problem Statement

`BaseAgent.execute()` at `apps/ai-worker/src/agents/base.agent.ts:123` is a
monolithic method. It calls `executeTask()`, validates output against a Zod
schema, calls `calculateConfidence()` which returns a hardcoded `0.8` by default
(`base.agent.ts:218`), and returns. There is no explicit state machine, no
planner phase, and no reflection gate.

The audit Quadrant-D lifecycle table (2026-04-17) surfaces this gap verbatim:

> | Phase                                  | Present?  | Notes                                                                                            |
> | -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
> | Init                                   | ✅        | `base.agent.ts:92–118`                                                                           |
> | **Plan** (pre-tool decomposition)      | ❌        | Absent — no planner phase                                                                        |
> | Execute (LLM call)                     | ✅        | `base.agent.ts:266` `invokeLLM()`                                                                |
> | **Reflect** (post-output quality gate) | ⚠ Partial | Hallucination check at `ai-worker.ts:334` is fire-and-forget (`.catch(() => {})`) — never blocks |
> | Finalize                               | ⚠ Partial | `markAgentIdle()` + cost tracker; no guaranteed flush per call                                   |
>
> Interpretation: Current code is "structured LLM call pipelines" rather than
> "agents that reason about their own work."

And in the severity findings:

> | M11 | Hallucination check is fire-and-forget — detected hallucinations never
> block output | Med | | M12 | `BaseAgent.executeTask` is monolithic — no
> planner or reflection phases | Med |

The net effect: the system cannot self-assess its output, detected
hallucinations have no blocking path, and confidence is a static constant with
no signal unless a subclass explicitly overrides it.

## Decision Drivers

- **Observable quality** — today the system has no mechanism to assess the
  quality of its own output before returning it to callers.
- **Self-correction** — detected hallucinations must have a path back to
  re-generation or outright rejection rather than being silently swallowed by
  `.catch(() => {})`.
- **Composability with existing layers** — the plan/reflect model must compose
  cleanly with ADR-006 tRPC tool approval middleware and the ADR-037 AI output
  review queue.
- **Cost control** — the reflect phase adds at least one LLM call per agent
  invocation; this must be opt-in per agent and budget-gateable so that
  operators can trade cost against quality.

## Considered Options

- **Option A**: Leave the monolithic lifecycle as-is.
- **Option B**: Explicit 3-phase state machine with typed transitions (plan →
  execute → reflect) inside `BaseAgent`.
- **Option C**: LangGraph or xState-based external workflow engine governing
  phase transitions.

## Decision Outcome

Chosen option: **Option B — explicit 3-phase state machine with typed
transitions inside `BaseAgent`**.

`BaseAgent.execute()` is refactored into three composable phases. The new
contract:

```typescript
async execute(task: AgentTask<TInput, TOutput>): Promise<AgentResult<TOutput>> {
  const plan    = await this.plan(task);             // Phase 1: decompose + tool select
  const raw     = await this.executePlan(plan, task); // Phase 2: LLM + tool calls
  const verdict = await this.reflect(raw, plan, task); // Phase 3: quality gate

  if (verdict.action === 'retry') {
    // Bounded retry — maximum 1 re-entry per call chain
    return this.executeOnce(task);
  }
  if (verdict.action === 'reject') {
    throw new OutputRejectedError(verdict.reason ?? 'reflect gate rejected output');
  }
  return this.buildResult(raw, verdict.confidence, task); // approved
}
```

Both `plan()` and `reflect()` have default implementations that preserve current
behavior when not overridden, making the refactor non-breaking for the 4
existing subclasses.

### Phase 1 — `plan()`

Returns a typed `AgentPlan` object:

```typescript
interface AgentPlan {
  intent: string;
  toolsToCall: string[]; // names from agentToolRegistry
  estimatedConfidence: number; // 0–1; informs reflect threshold
}
```

**Default implementation**: returns
`{ intent: task.description, toolsToCall: [], estimatedConfidence: 0.7 }`.

Subclasses override `plan()` to perform LLM-based decomposition, load
ChainVersionService-specified prompts (addressing audit H3), and select tools
from the registry. Planning is opt-in per agent via
`BaseAgentConfig.usesPlanning: boolean` (default `false`); when `false`, the
default implementation runs without an LLM call.

### Phase 2 — `executePlan()`

Replaces the existing `executeTask()` call. Accepts the `AgentPlan` from Phase 1
so subclasses can use `plan.toolsToCall` for explicit dispatch rather than
rule-based lookups (audit A2). The existing `executeTask()` abstract method is
preserved as the inner implementation target — subclasses implement
`executeTask()` unchanged; `executePlan()` is a thin wrapper that feeds the plan
through.

### Phase 3 — `reflect()`

Returns a typed `ReflectVerdict` object:

```typescript
interface ReflectVerdict {
  action: 'approve' | 'retry' | 'reject';
  reason?: string;
  confidence: number; // replaces the hardcoded 0.8 default
}
```

Two implementation modes:

**Rule-based (default, zero LLM cost)**:

1. Validate output against `task.expectedOutput` Zod schema (already performed
   in current `execute()`; moved here so it blocks the return path).
2. Inspect the hallucination flag emitted by the monitoring layer (the
   fire-and-forget `.catch()` at `ai-worker.ts:334` is **removed** — the check
   becomes awaited and its result feeds this step).
3. Compare `plan.estimatedConfidence` against the agent's configured
   `confidenceThreshold` (new `BaseAgentConfig` field, default `0.6`).
   - Above threshold → `approve`.
   - Below threshold and `retryCount === 0` → `retry`.
   - Below threshold and `retryCount === 1`, or hallucination detected →
     `reject`.

**LLM-based (opt-in)**: Enabled per agent via
`BaseAgentConfig.usesReflection: boolean` (default `false`). When `true`, Phase
3 calls `createLLM('reasoning', 'free')` (ADR-048 factory) with a structured
prompt asking the model to score the output against the original task intent.
The LLM returns a `ReflectVerdict`-shaped JSON. This path adds one
`reasoning-free` LLM call per invocation.

**Hallucination gate**: the `.catch(() => {})` at `ai-worker.ts:334` is removed.
The hallucination check becomes a blocking `await` inside the default
`reflect()` implementation. A positive hallucination flag always produces
`action: 'reject'` regardless of the `retryCount`.

### Positive Consequences

- Agents can self-assess their output before returning it to callers.
- Hallucinations have a blocking path; silent pass-through is eliminated.
- The rule-based reflect default adds zero LLM cost and is drop-in safe for
  existing subclasses.
- `ReflectVerdict.confidence` replaces the hardcoded `0.8` constant, making
  confidence a first-class output of the lifecycle rather than a placeholder.
- `reject` verdict enqueues the output to the ADR-037 review queue instead of
  silently dropping it, so human reviewers see it (see §Related — ADR-037).
- Phase transitions emit `AIMonitoringEvent` with the phase name tag (see
  §Related — ADR-043), enabling per-phase latency and failure telemetry.

### Negative Consequences

- One extra LLM call per invocation when `usesReflection: true` (~$0 on the
  `reasoning-free` routing tier; measurable at scale on premium tiers).
- Retry policy (max 1) doubles worst-case LLM call count for a single task when
  `retry` verdict fires.
- Bounded retry is simpler than a full retry-with-backoff policy; agents with
  higher quality requirements may need a future extension point.

### Mitigations

- `usesPlanning` and `usesReflection` are both `false` by default — zero
  behavioral change for agents that do not opt in.
- Both flags are gated by a `confidenceThreshold` check before the reflect LLM
  call fires, so low-stakes agents pay no extra cost.
- The reflect LLM call is subject to the same `LLM_TIMEOUT_MS` guard as all
  other LLM calls; a timeout produces `action: 'approve'` with a warning log
  (fail-open to preserve availability).

## Pros and Cons of the Options

### Option A — Leave monolithic lifecycle as-is

- Good, because zero code change; zero risk of regression.
- Bad, because hallucinations remain silently swallowed.
- Bad, because confidence is permanently a meaningless constant unless every
  subclass manually overrides `calculateConfidence()`.
- Bad, because audit findings M11 and M12 are unresolved, blocking GA readiness
  for the agent system.

### Option B — Explicit 3-phase state machine (chosen)

- Good, because default implementations are non-breaking for existing
  subclasses.
- Good, because opt-in flags let each agent adopt phases incrementally.
- Good, because the blocking hallucination gate closes audit M11 without
  requiring an external orchestrator.
- Good, because the typed `AgentPlan` enables future LLM-driven tool selection
  (audit A2).
- Bad, because the retry path doubles worst-case LLM calls when a retry fires.
- Bad, because `usesReflection: true` agents incur one extra LLM call per
  invocation.

### Option C — LangGraph / xState external workflow engine

- Good, because state transitions are declared and inspectable externally.
- Good, because pause/resume (for human approval mid-flow) becomes first-class.
- Bad, because it introduces a new runtime dependency (LangGraph or xState) that
  the existing codebase does not use.
- Bad, because migrating all 4 agents to a new orchestrator simultaneously
  carries high regression risk pre-GA.
- Bad, because the agent system is not yet complex enough to justify a full
  graph-based orchestrator; CrewAI skeleton (audit A1) is already deferred.
  Defer until CrewAI orchestrator is wired.

## Supersedes / Related

### Supersedes (partial)

- **ADR-006 §Implementation** — the `BaseAgent.execute()` lifecycle described
  implicitly in ADR-006 (single-call LLM dispatch with no phases) is superseded
  by the 3-phase model defined here. ADR-006 tool-approval mechanics (tRPC
  tools, approval middleware, approval UI) are **not** affected; the plan phase
  selects which tools to call, but the approval gate remains in the ADR-006
  approval flow.

### Related

- **ADR-037** — When `reflect()` returns `action: 'reject'`, the output and
  reject reason are enqueued to the AI output review queue defined in ADR-037
  rather than being silently discarded. This closes the feedback-loop gap
  identified in audit finding A3.
- **ADR-043** — Phase transitions (plan start, execute start, reflect
  start/verdict) emit `AIMonitoringEvent` records with `eventType: 'lifecycle'`
  and `payload.phase` set to `'plan' | 'execute' | 'reflect'`. This extends
  ADR-043's event taxonomy without requiring a schema migration (the `payload`
  field is `Json`). The `provider` and `tier` fields added by ADR-048 continue
  to be emitted on the reflect LLM call.
- **ADR-048** — When `usesReflection: true`, the reflect LLM call is routed
  through `createLLM('reasoning', 'free')` using the ADR-048 factory. This
  ensures reflect calls respect the same provider routing, cost tracking, and EU
  data-residency rules as all other LLM calls.

## Migration Plan

| Phase | Task                    | Description                                                                                                                                                                                                                                                                                                 |
| ----- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Refactor base           | Introduce `plan()`, `executePlan()`, `reflect()` with default no-op / rule-based implementations. Add `usesPlanning`, `usesReflection`, `confidenceThreshold` to `BaseAgentConfig`. Keep `executeTask()` as the inner Phase 2 target. All 4 existing subclasses continue to compile and behave identically. |
| 2     | Remove fire-and-forget  | Replace `.catch(() => {})` at `ai-worker.ts:334` with a blocking `await` and feed the hallucination result into the default `reflect()` rule.                                                                                                                                                               |
| 3     | Migrate existing agents | Enable `usesPlanning: true` and `usesReflection: true` in `LeadQualificationAgent`, `FollowupAgent`, `EmailWriterAgent`, `NextBestActionAgent` one-by-one. Override `plan()` to use `ChainVersionService`-loaded prompts (closes audit H3 per-agent).                                                       |
| 4     | Bounded retry policy    | Implement `executeOnce()` wrapper that tracks `retryCount` on the call stack and enforces the max-1 bound.                                                                                                                                                                                                  |
| 5     | ADR-037 reject enqueue  | Wire `OutputRejectedError` catch in the job handlers to push rejected outputs to the AI output review queue.                                                                                                                                                                                                |

## Testing

- **Unit — `plan()`**: default returns correct shape; opt-in override calls LLM
  and returns typed `AgentPlan`.
- **Unit — `reflect()` rule-based**: Zod schema failure → `reject`;
  hallucination flag → `reject`; confidence below threshold on first attempt →
  `retry`; confidence below threshold on second attempt → `reject`; all clear →
  `approve`.
- **Unit — `reflect()` LLM-based**: mocked `createLLM` returns `approve` /
  `retry` / `reject` JSON; each path produces correct `ReflectVerdict`.
- **Unit — retry bound**: verify `execute()` calls `executeOnce()` at most once
  on consecutive `retry` verdicts (second call receives `retryCount === 1` →
  `reject`).
- **Unit — reject propagation**: `OutputRejectedError` is thrown and propagates
  correctly to the BullMQ job handler without being swallowed.
- **Integration**: `LeadQualificationAgent` with `usesReflection: true` — full
  cycle with mocked LLM returning a hallucination flag → verify output is
  enqueued to ADR-037 review queue instead of returned.
- **Non-regression**: existing subclasses with both flags `false` — verify
  `AgentResult` shape, confidence field, and `executionCount` counter are
  unchanged.

## Explicit deferrals (named for audit traceability)

The following items are **intentionally deferred** beyond the initial Accepted
scope and are named here so future audit waves can cross-reference them by ID
rather than inferring from the Phase table above.

- **DEF-049-1 — LLM-based `reflect()` verdict**: currently a rule-based gate
  only (schema match + hallucination flag + confidence threshold). Upgrading to
  an LLM-based reflect that composes `plan.estimatedConfidence` with each
  agent's `calculateConfidence()` output is opt-in per agent via a future
  `usesLLMReflection: boolean` config flag. Reason: adds one LLM call per
  execution — needs per-tenant budget controls before enablement. Target:
  sprint-18 spike, sprint-19 ship.
- **DEF-049-2 — Per-agent `calculateConfidence()` override restoration**: When
  `usesReflection: true` is active, `AgentResult.confidence` comes from
  `verdict.confidence` (default `0.7`), NOT from each agent's
  `calculateConfidence()`. This is a semantic regression for agents with
  carefully-computed per-signal confidence (FollowupAgent, EmailWriterAgent).
  Resolution path: LLM-based reflect (DEF-049-1) can blend both, OR the rule-
  based reflect can be extended to read `calculateConfidence()` as a signal.
  Target: sprint-19 with DEF-049-1.
- **DEF-049-3 — `usesPlanning: true` rollout**: not enabled on any agent yet.
  Needs product design (which tools each agent's planner can select, planner
  prompt templates, integration with ADR-006 tool-approval). Target: sprint-19
  planning session.

## References

- `docs/architecture/audits/2026-04-17-agent-system-audit.md` — Quadrant D
  findings M11 and M12; full severity table; remediation roadmap (M12 line:
  "architectural refactor; own ADR").
- `apps/ai-worker/src/agents/base.agent.ts` — current monolithic `execute()` at
  line 123; `calculateConfidence()` at line 216 (hardcoded `0.8`).
- [ADR-006 Agent Tool-Calling Model](./ADR-006-agent-tools.md) — tRPC tools +
  approval middleware; partially superseded (lifecycle only).
- [ADR-037 AI Output Review Layer](./ADR-037-ai-output-review.md) — reject path
  enqueues to this review queue.
- [ADR-043 AI Monitoring Data Persistence](./ADR-043-ai-monitoring-data-persistence.md)
  — phase-transition events extend the `AIMonitoringEvent` taxonomy.
- [ADR-048 Hybrid AI Inference](./ADR-048-hybrid-ai-inference.md) — reflect LLM
  calls route through `createLLM('reasoning', 'free')`.
