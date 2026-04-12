---
name: spec-consensus
description:
  Sub-skill of /spec-session. Handles Round 4+ consensus detection and team mode
  debate. Reaches agreement across agents before finalising the specification.
---

# Spec Consensus Skill

Handles consensus detection after the CHALLENGE round. Can run standalone to
re-run consensus if initial attempt failed.

**Called by**: `/spec-session` Round 4+ (after CHALLENGE round) **Can also run
standalone**: Yes — to re-run consensus if initial attempt failed

## Consensus Rules

### Subagent Mode

Consensus is reached when:

- Round type is CONSENSUS
- > = 66% of agents have "approved" in their response
- No critical unresolved issues

If consensus isn't reached after 3 CONSENSUS rounds, session fails.

### Agent Team Mode

- Each teammate sends: `APPROVED` or `REJECTED: <reason>`
- Lead collects responses, checks >= 66% threshold
- Teammate non-response within 60s: lead nudges
- Still no response after 30s: treat as abstention

**See references/consensus-process.md** for full details, TypeScript snippet,
team lifecycle, fallback logic, and CONSENSUS round output format.

## Self-Check Questions

Before finalising spec, verify:

1. Did each agent actually call Read tool? (Check tool use blocks)
2. Are file paths and line numbers cited in analysis?
3. Were discrepancies between summary and actual code noted?
4. Do proposals build on patterns found in actual code?

## Related Commands

- `/spec-session` — Parent command that calls this sub-skill
- `/spec-exploration` — Phase 0.75 (must run before consensus)
