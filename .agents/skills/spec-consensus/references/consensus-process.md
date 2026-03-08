# Spec Consensus — Full Consensus Process

## Consensus Rules

### Subagent Mode

Consensus is reached when:
- Round type is CONSENSUS
- >= 66% of agents have "approved" in their response
- No critical unresolved issues

If consensus isn't reached after 3 CONSENSUS rounds, session fails.

### Agent Team Mode

In team mode, consensus uses direct messages from teammates to the lead:
- Each teammate sends: `APPROVED` or `REJECTED: <reason>`
- Lead collects responses and checks >= 66% threshold
- If teammate doesn't respond within 60 seconds, lead nudges them
- If still no response after 30 more seconds, treat as abstention

```typescript
const verdicts = teammateMessages.map(msg => ({
  agent: msg.from,
  approved: msg.content.startsWith('APPROVED'),
  reason: msg.content.startsWith('REJECTED') ? msg.content.slice(10) : undefined,
}));

const approvalRate = verdicts.filter(v => v.approved).length / verdicts.length;
const consensusReached = approvalRate >= 0.66;
```

## Team Mode CHALLENGE Round

The CHALLENGE round is where team mode adds the most value — real inter-agent debate:

```
Security-Lead → Backend-Architect: "Your endpoint at lead.router.ts:145
  lacks input validation. What sanitization do you plan?"
Backend-Architect → Security-Lead: "Agreed. Adding Zod guard with
  leadCreateSchema. Updated proposal."
Test-Engineer → Domain-Expert: "Missing edge case for null score in
  LeadScore.create(). What should happen?"
Domain-Expert → Test-Engineer: "Should throw InvalidLeadScoreError.
  Added guard clause."
```

### Team Round Broadcast

```typescript
import { buildTeamRoundBroadcast } from './tools/scripts/lib/stoa/spec-session.js';

const broadcast = buildTeamRoundBroadcast(session, roundType, previousSummary);
// Lead posts broadcast as message to all teammates
```

## Team Lifecycle

1. Create team with one teammate per agent role
2. Each teammate gets exploration findings as initial context
3. Broadcast round start to all teammates
4. CHALLENGE round: teammates message each other directly
5. Lead monitors messages and captures resolved challenges
6. Collect final contributions from each teammate
7. After all rounds, shut down teammates (30s timeout)

## Fallback

If team creation fails at any point:

```typescript
try {
  // Attempt team creation...
} catch (error) {
  console.warn(`[Agent Team] Creation failed, falling back to subagents: ${error}`);
  session.agentMode = 'subagent';
  // Continue with subagent spawning
}
```

## CONSENSUS Round Output

Each agent provides:
- **Agreement**: Which proposals they support
- **Modifications**: Suggested changes
- **Sign-off**: Ready to approve specification
- **Final Notes**: Remaining concerns
- **Files Verified**: Confirmation of files read during session

## Self-Check Questions

Before finalising spec, verify:
1. Did each agent actually call Read tool? (Check tool use blocks)
2. Are file paths and line numbers cited in analysis?
3. Were discrepancies between summary and actual code noted?
4. Do proposals build on patterns found in actual code?
