# AI-Assisted Development

## Claude Code Workflows

Custom commands in `.claude/commands/`:

- `/create-aggregate`: Scaffold new DDD aggregate with tests
- `/create-router`: Generate tRPC router for entity
- `/create-migration`: Create Prisma migration with validation
- `/review-ai-output`: Review AI-generated code for quality

## GitHub Copilot

`.github/copilot-instructions.md` provides context for project structure, type safety, testing standards, DDD principles.

## AI Code Generation Best Practices

1. **Always validate types**: Generated code must pass TypeScript strict mode
2. **Check tests**: AI-generated code must include tests with >90% coverage
3. **Review security**: Never accept AI-generated code without security review
4. **Verify domain logic**: Ensure business rules are correctly implemented
5. **Update documentation**: AI cannot update architecture docs — do this manually

## Agent Infrastructure

- 17 agents in `.claude/agents/`: 10 spec specialists, 1 plan reviewer, 6 STOA validators
- Spawn with `Task(subagent_type: "general-purpose", name: "<agent-name>")` + prompt that says `Read .claude/agents/<name>.md`
- **Plan Reviewer is MANDATORY** for ALL tasks

### Plan Review — 24 Categories

The plan reviewer checks these categories (A-X):

A. Files Summary accuracy, B. AC traceability, C. Test file completeness, D. Test case coverage, E. Spec value consistency, F. Accessibility requirements, G. Type location clarity, H. Dependency checks, I. Hook/utility coverage, J. CSV artifact alignment, K. Effort estimates, L. Design mockup verification, M. Non-functional requirements, N. Dependency chain update, O. Backend prerequisites, P. Shared component existence & refs, Q. Risk mitigation, R. Layer order, S. Integration checkpoints, T. Plan structure, U. Coverage targets, V. **Test count arithmetic**, W. **Spec integration points cross-check**, X. **Internal vs shared pattern clarity**

### Runtime Validation Gates

5 gates added to catch DI wiring gaps and false attestations:
1. **Dependency Deep Verification** (plan-session, spec-session)
2. **Container Registration Check** (exec Phase 2.5, exec-gates Gate 5)
3. **Smoke Test** (exec Phase 4.3)
4. **Attestation Forensics** (compliance-check §6)
5. **Mock Coverage Audit** (compliance-check §7, exec-gates Gate 6)
