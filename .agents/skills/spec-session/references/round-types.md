# Spec Session — Round Types

## CRITICAL: All Rounds Require File Citations

All rounds MUST include file citations. Analysis without file references is INVALID.

## Round 1: ANALYSIS

Understanding the task (with file citations, at least 2 per agent):

- **Files Reviewed**: List of files read (with line numbers)
- **Interpretation**: Task understanding (citing code)
- **Questions**: Clarification needs
- **Concerns**: Initial risks (referencing specific code)
- **Dependencies**: What's needed from other agents

## Round 2: PROPOSAL

Technical approach (referencing actual code patterns):

- **Approach**: Implementation strategy (referencing existing patterns)
- **Files**: Files to create/modify (with rationale)
- **Interfaces**: Contracts or APIs (citing similar interfaces)
- **Integration**: How work connects to others
- **Runtime Consumer**: Which existing production path will call the new code, and which legacy path (if any) must be replaced or retired

## Round 3: CHALLENGE

Risks and edge cases (from code review evidence):

- **Challenges**: What could go wrong (with code evidence)
- **Edge Cases**: Unhandled scenarios (from code review)
- **Integration Issues**: Potential conflicts (citing both files)
- **Dead-On-Arrival Risk**: Could any proposed file, endpoint, or procedure exist on disk but remain unused in the real runtime path?
- **UI Reachability** (UI tasks only): Is the page/route discoverable from the app shell? Check sidebar configs at `apps/web/src/components/sidebar/configs/`, parent page links, and layout breadcrumbs. A page reachable only by direct URL is an integration issue that MUST be resolved before consensus.
- **Suggestions**: Fixes for identified issues

## Round 4: CONSENSUS

Unified agreement (invoke `/spec-consensus <TASK_ID>` for consensus detection):

- **Agreement**: Which proposals they support
- **Modifications**: Suggested changes
- **Sign-off**: Ready to approve specification
- **Final Notes**: Remaining concerns
- **Files Verified**: Confirmation of files read during session

> For consensus detection and team debate mechanics, invoke `/spec-consensus <TASK_ID>`.
> See `/spec-consensus` for approval thresholds, team mode debate, and recovery.

## Example Session

```
User: /spec-session IFC-101

[Spec Session] Task: IFC-101 — Lead Domain Model
[Phase 0] Context hydrated (3 deps, 12 patterns)
[Phase 0.5] Agents: Backend-Architect, Data-Engineer, Domain-Expert, Test-Engineer
[Phase 0.75] /spec-exploration IFC-101 — 4 agents explored codebase
[Phase 0.9] Dependency chain verified
[Round 1: ANALYSIS] — 4 agents with file citations
[Round 2: PROPOSAL] — 4 agents with code references
[Round 3: CHALLENGE] — 3 edge cases, 1 integration risk
[Round 4: CONSENSUS] — 4/4 approved (100%)
[Output] Spec written to .specify/sprints/sprint-2/specifications/IFC-101-spec.md
```

## Validation Indicators

**Valid indicators**: Exploration agents used tools, each read 2+ files, all analysis has file:line citations.

**INVALID (reject)**: No tool calls, analysis without citations, "Based on context provided..." without verification.
