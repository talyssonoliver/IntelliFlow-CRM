# ADR-XXX: [Title of Decision]

**Status:** [Proposed | Accepted | Rejected | Deprecated | Superseded by
ADR-YYY]

**Date:** YYYY-MM-DD

**Deciders:** [List of people/roles involved in the decision]

**Technical Story:** [Link to relevant task/issue, e.g., IFC-001, GOV-001]

## Context and Problem Statement

[Describe the architectural context and problem statement in 2-3 sentences.
Articulate the problem as a question if possible.]

## Decision Drivers

- [driver 1, e.g., technical constraint, business requirement, quality
  attribute]
- [driver 2, e.g., compliance requirement, performance target]
- [driver 3, e.g., team capability, timeline constraint]
- ... <!-- numbers of drivers can vary -->

## Considered Options

- [option 1]
- [option 2]
- [option 3]
- ... <!-- numbers of options can vary -->

## Decision Outcome

Chosen option: "[option 1]", because [justification - explain why this option
best satisfies the decision drivers and resolves the problem].

### Positive Consequences

- [e.g., improvement of quality attribute satisfaction, enabler for future
  capabilities]
- [e.g., reduced complexity, better maintainability]
- ...

### Negative Consequences

- [e.g., compromising quality attribute, technical debt incurred]
- [e.g., follow-up decisions required, migration effort needed]
- ...

## Pros and Cons of the Options

### [option 1]

[Brief description or pointer to more information]

- Good, because [argument a]
- Good, because [argument b]
- Bad, because [argument c]
- ... <!-- numbers of pros and cons can vary -->

### [option 2]

[Brief description or pointer to more information]

- Good, because [argument a]
- Good, because [argument b]
- Bad, because [argument c]
- ... <!-- numbers of pros and cons can vary -->

### [option 3]

[Brief description or pointer to more information]

- Good, because [argument a]
- Good, because [argument b]
- Bad, because [argument c]
- ... <!-- numbers of pros and cons can vary -->

## Links

- [Link type] [Link to ADR] <!-- example: Supersedes ADR-005 -->
- [Link type] [Link to ADR] <!-- example: Related to ADR-012 -->
- [Related documentation, e.g., architecture overview]
- [Sprint plan task reference]
- [Technical RFC or design doc]

## Implementation Notes

[Any specific notes about implementing this decision, such as migration steps,
configuration changes, or code patterns to follow]

### Validation Criteria

- [ ] Criterion 1 met
- [ ] Criterion 2 met
- [ ] Tests written
- [ ] Documentation updated
- [ ] Architecture tests passing (if applicable)

### Rollback Plan

[Describe how to rollback this decision if it proves problematic in production]

---

## Guidelines for Using This Template

1. **Numbering**: Use sequential numbering (001, 002, etc.) based on
   chronological order
2. **Status**: Start as "Proposed", move to "Accepted" after review, or
   "Rejected" if declined
3. **Keep it concise**: ADRs should be scannable - aim for 1-2 pages maximum
4. **Focus on "why"**: Document the reasoning and context, not just the decision
5. **Update status**: Mark as "Deprecated" or "Superseded" when replaced by
   newer decisions
6. **Link related ADRs**: Create a web of architectural knowledge
7. **Include validation**: Define how to verify the decision was implemented
   correctly

## When to Create an ADR

Create an ADR for decisions that:

- Affect the structure or organization of the codebase
- Introduce or change architectural patterns
- Impact multiple teams or bounded contexts
- Have significant trade-offs that need documentation
- Are hard to reverse (one-way doors)
- Require explanation for future maintainers

Do NOT create ADRs for:

- Trivial decisions with obvious answers
- Temporary workarounds or experiments
- Implementation details within a single module
- Decisions that can be easily reversed

## Review Process

1. Author creates ADR with status "Proposed"
2. Submit as PR with ADR template filled out
3. Request review from architecture team and affected stakeholders
4. Discuss and iterate on the proposal
5. Update status to "Accepted" or "Rejected" after consensus
6. Merge PR to make decision official

---

**Related Templates:**

- [ARP Template](../arp/000-template.md) - For proposing architectural changes
- [Decision Workflow](../decision-workflow.md) - Process for making decisions
