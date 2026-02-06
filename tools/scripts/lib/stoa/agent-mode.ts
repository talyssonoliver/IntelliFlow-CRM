/**
 * Agent Mode Detection & Resolution
 *
 * Determines whether to use subagents (default) or agent teams (experimental)
 * for inter-agent communication in spec, plan, and exec sessions.
 *
 * Agent teams enable direct inter-agent messaging (e.g., Security-Lead can
 * challenge Backend-Architect directly), whereas subagents can only report
 * back to the caller.
 *
 * Feature flag: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in ~/.claude/settings.json
 *
 * @module tools/scripts/lib/stoa/agent-mode
 */

export type AgentMode = 'subagent' | 'team';

/**
 * Check whether the agent teams experimental feature is enabled.
 * Reads from CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS environment variable.
 */
export function isAgentTeamsEnabled(): boolean {
  return process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1';
}

/**
 * Check whether the current process is running as a teammate (not lead).
 * Teammates cannot create nested teams — they must fall back to subagents.
 */
export function isTeammate(): boolean {
  return process.env.CLAUDE_CODE_IS_TEAMMATE === '1';
}

/**
 * Resolve which agent mode to use for a given session type and agent count.
 *
 * Rules:
 * - If forceMode is provided, use it directly
 * - If agent teams are disabled, always use subagent
 * - If running as a teammate already, always use subagent (no nested teams)
 * - spec sessions: use team when ≥3 agents (CHALLENGE round benefits from debate)
 * - plan sessions: always subagent by default (opt-in only via forceMode)
 * - exec sessions: use team when ≥2 STOAs (cross-STOA finding sharing)
 */
export function resolveAgentMode(
  sessionType: 'spec' | 'plan' | 'exec',
  agentCount: number,
  forceMode?: AgentMode
): AgentMode {
  if (forceMode) return forceMode;
  if (!isAgentTeamsEnabled()) return 'subagent';
  if (isTeammate()) return 'subagent';

  switch (sessionType) {
    case 'spec':
      return agentCount >= 3 ? 'team' : 'subagent';
    case 'plan':
      return 'subagent'; // opt-in only via forceMode
    case 'exec':
      return agentCount >= 2 ? 'team' : 'subagent';
    default:
      return 'subagent';
  }
}
