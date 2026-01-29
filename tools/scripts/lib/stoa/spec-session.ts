/**
 * Spec Session - Multi-Round Agent Discussion
 *
 * Orchestrates parallel sub-agents through structured discussion:
 * - ROUND 1: Analysis (understanding the task)
 * - ROUND 2: Proposal (technical approach)
 * - ROUND 3: Challenge (risk & edge cases)
 * - ROUND 4+: Consensus (unified specification)
 *
 * @module tools/scripts/lib/stoa/spec-session
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  HydratedContext,
  AgentSelection,
  AgentRole,
  SpecRoundType,
  AgentContribution,
  SpecSessionRound,
  SpecificationDocument,
  SpecSession,
  SpecComponent,
  SpecIntegrationPoint,
  SpecRisk,
  DependencyArtifact,
  CodebasePattern,
} from './types.js';
import { AGENT_POOL } from './agent-selection.js';
import {
  getSpecificationsDir,
  getSpecPath,
  getDiscussionPath,
} from './paths.js';

// ============================================================================
// Constants
// ============================================================================

const MAX_SPEC_ROUNDS = 10;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per agent

const ROUND_TOPICS: Record<SpecRoundType, string> = {
  ANALYSIS: 'Understanding the Task Completely',
  PROPOSAL: 'Technical Approach & Implementation',
  CHALLENGE: 'Risks, Edge Cases & Integration',
  CONSENSUS: 'Unified Specification Agreement',
};

const ROUND_SEQUENCE: SpecRoundType[] = ['ANALYSIS', 'PROPOSAL', 'CHALLENGE', 'CONSENSUS'];

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new spec session
 */
export function createSpecSession(
  taskId: string,
  hydratedContext: HydratedContext,
  selectedAgents: AgentSelection
): SpecSession {
  return {
    sessionId: `spec-${taskId}-${randomUUID().slice(0, 8)}`,
    taskId,
    hydratedContext,
    selectedAgents,
    rounds: [],
    status: 'in_progress',
    startedAt: new Date().toISOString(),
  };
}

/**
 * Get the round type for a given round number
 */
export function getRoundType(roundNumber: number): SpecRoundType {
  if (roundNumber <= ROUND_SEQUENCE.length) {
    return ROUND_SEQUENCE[roundNumber - 1];
  }
  // After initial sequence, continue with CONSENSUS rounds
  return 'CONSENSUS';
}

/**
 * Get topic for a round type
 */
export function getTopicForRound(roundType: SpecRoundType): string {
  return ROUND_TOPICS[roundType];
}

// ============================================================================
// Agent Prompt Generation
// ============================================================================

/**
 * Build prompt for an agent contribution
 */
export function buildAgentPrompt(
  agent: AgentRole,
  session: SpecSession,
  roundType: SpecRoundType,
  topic: string,
  previousContributions: AgentContribution[]
): string {
  const profile = AGENT_POOL.find((p) => p.role === agent);
  const task = session.hydratedContext.taskMetadata;

  let prompt = `# Agent Contribution Request

## Your Role: ${agent}
**Expertise:** ${profile?.expertise.join(', ') || 'General'}

## Task Context
- **Task ID:** ${task.taskId}
- **Section:** ${task.section || 'N/A'}
- **Description:** ${task.description || 'N/A'}
- **Definition of Done:** ${task.definitionOfDone || 'N/A'}

## Current Round: ${roundType}
**Topic:** ${topic}

`;

  // Add context summary
  prompt += `## Context Summary

### Dependencies
${session.hydratedContext.dependencyArtifacts.length > 0
    ? session.hydratedContext.dependencyArtifacts
        .map((d: DependencyArtifact) => `- ${d.taskId}: ${d.status || 'Unknown'}`)
        .join('\n')
    : 'No dependencies.'
  }

### Relevant Patterns Found
${session.hydratedContext.codebasePatterns.length > 0
    ? session.hydratedContext.codebasePatterns
        .slice(0, 5)
        .map((p: CodebasePattern) => `- ${p.filePath}:${p.lineNumber} (${p.keyword})`)
        .join('\n')
    : 'No patterns found.'
  }

`;

  // Add previous contributions if any
  if (previousContributions.length > 0) {
    prompt += `## Previous Contributions This Round

`;
    for (const contrib of previousContributions) {
      prompt += `### ${contrib.agent}
${formatContributionForPrompt(contrib)}

`;
    }
  }

  // Add round-specific instructions
  prompt += `## Your Task

${getRoundInstructions(roundType, agent)}

## Output Format

Provide your contribution in the following JSON structure:

\`\`\`json
${getOutputSchema(roundType)}
\`\`\`

Respond with ONLY the JSON object, no additional text.
`;

  return prompt;
}

/**
 * Get round-specific instructions for an agent
 */
function getRoundInstructions(roundType: SpecRoundType, agent: AgentRole): string {
  switch (roundType) {
    case 'ANALYSIS':
      return `As the ${agent}, analyze the task from your domain perspective:

1. **Interpretation**: How do you understand this task? What's the core objective?
2. **Questions**: What information is unclear or needs clarification?
3. **Concerns**: What initial risks or challenges do you foresee?
4. **Dependencies**: What do you need from other agents to proceed?

Focus on your area of expertise (${AGENT_POOL.find((p) => p.role === agent)?.expertise.join(', ') || 'general'}).`;

    case 'PROPOSAL':
      return `As the ${agent}, propose your contribution to the implementation:

1. **Approach**: What's your concrete implementation strategy?
2. **Files**: What files will you create or modify?
3. **Interfaces**: What contracts or APIs will you expose?
4. **Integration**: How does your work connect to other agents' contributions?

Be specific about technical details relevant to your expertise.`;

    case 'CHALLENGE':
      return `As the ${agent}, challenge the proposals and identify issues:

1. **Challenges**: What could go wrong with the proposed approaches?
2. **Edge Cases**: What scenarios haven't been considered?
3. **Integration Issues**: Where might different contributions conflict?
4. **Security/Performance**: Any concerns in your domain?

Be constructive - identify problems AND suggest solutions.`;

    case 'CONSENSUS':
      return `As the ${agent}, work toward consensus:

1. **Agreement**: Which proposals do you support?
2. **Modifications**: What changes would you suggest?
3. **Sign-off**: Are you ready to approve the specification?
4. **Final Notes**: Any remaining concerns?

Focus on reaching a unified approach that satisfies your domain requirements.`;

    default:
      return 'Provide your contribution based on your expertise.';
  }
}

/**
 * Get output schema for a round type
 */
function getOutputSchema(roundType: SpecRoundType): string {
  switch (roundType) {
    case 'ANALYSIS':
      return `{
  "interpretation": "Your understanding of the task",
  "questions": ["Question 1", "Question 2"],
  "concerns": ["Concern 1", "Concern 2"],
  "dependencies": ["What you need from Agent X", "What you need from Agent Y"]
}`;

    case 'PROPOSAL':
      return `{
  "proposal": "Your technical approach and implementation strategy",
  "files": {
    "create": ["path/to/new/file.ts"],
    "modify": ["path/to/existing/file.ts"]
  },
  "interfaces": "TypeScript interface definitions you'll expose",
  "integration": "How your work integrates with others"
}`;

    case 'CHALLENGE':
      return `{
  "challenges": ["Challenge to proposal X", "Issue with approach Y"],
  "edgeCases": ["Edge case 1", "Edge case 2"],
  "integrationIssues": ["Potential conflict between A and B"],
  "suggestions": ["Suggested fix for issue 1", "Alternative approach for problem 2"]
}`;

    case 'CONSENSUS':
      return `{
  "consensus": "Your final position and agreements",
  "approved": true,
  "modifications": ["Suggested modification 1"],
  "finalNotes": "Any remaining notes"
}`;

    default:
      return '{}';
  }
}

/**
 * Format a contribution for inclusion in subsequent prompts
 */
function formatContributionForPrompt(contrib: AgentContribution): string {
  const parts: string[] = [];

  if (contrib.interpretation) {
    parts.push(`**Interpretation:** ${contrib.interpretation}`);
  }
  if (contrib.questions?.length) {
    parts.push(`**Questions:** ${contrib.questions.join('; ')}`);
  }
  if (contrib.concerns?.length) {
    parts.push(`**Concerns:** ${contrib.concerns.join('; ')}`);
  }
  if (contrib.proposal) {
    parts.push(`**Proposal:** ${contrib.proposal}`);
  }
  if (contrib.challenges?.length) {
    parts.push(`**Challenges:** ${contrib.challenges.join('; ')}`);
  }
  if (contrib.consensus) {
    parts.push(`**Consensus:** ${contrib.consensus}`);
  }

  return parts.join('\n');
}

// ============================================================================
// Contribution Parsing
// ============================================================================

/**
 * Parse agent response into contribution
 */
export function parseAgentResponse(
  response: string,
  agent: AgentRole,
  round: number,
  roundType: SpecRoundType
): AgentContribution {
  const contribution: AgentContribution = {
    agent,
    round,
    roundType,
    timestamp: new Date().toISOString(),
  };

  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Map fields based on round type
      if (parsed.interpretation) contribution.interpretation = parsed.interpretation;
      if (parsed.questions) contribution.questions = parsed.questions;
      if (parsed.concerns) contribution.concerns = parsed.concerns;
      if (parsed.dependencies) contribution.dependencies = parsed.dependencies;
      if (parsed.proposal) contribution.proposal = parsed.proposal;
      if (parsed.challenges) contribution.challenges = parsed.challenges;
      if (parsed.consensus) contribution.consensus = parsed.consensus;
    }
  } catch {
    // If JSON parsing fails, use raw response as interpretation
    contribution.interpretation = response.slice(0, 500);
  }

  return contribution;
}

// ============================================================================
// Round Execution
// ============================================================================

/**
 * Execute a spec round - meant to be used with parallel sub-agents
 *
 * In practice, this function prepares the prompts and structure.
 * The actual agent spawning happens in the orchestrator using Task tool.
 */
export function prepareSpecRound(
  session: SpecSession,
  roundType: SpecRoundType
): { agents: AgentRole[]; prompts: Map<AgentRole, string>; topic: string } {
  const topic = getTopicForRound(roundType);
  const agents = session.selectedAgents.selectedAgents;
  const prompts = new Map<AgentRole, string>();

  // Get previous contributions from this round (for sequential within round)
  const previousContributions = session.rounds
    .filter((r: SpecSessionRound) => r.roundNumber === session.rounds.length + 1)
    .flatMap((r: SpecSessionRound) => r.contributions);

  for (const agent of agents) {
    const prompt = buildAgentPrompt(agent, session, roundType, topic, previousContributions);
    prompts.set(agent, prompt);
  }

  return { agents, prompts, topic };
}

/**
 * Create a round result from agent contributions
 */
export function createSpecRound(
  roundNumber: number,
  roundType: SpecRoundType,
  topic: string,
  contributions: AgentContribution[]
): SpecSessionRound {
  return {
    roundNumber,
    roundType,
    topic,
    contributions,
    consensusReached: checkConsensus(contributions, roundType),
    startedAt: contributions[0]?.timestamp || new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

/**
 * Add a completed round to the session
 */
export function addRoundToSession(session: SpecSession, round: SpecSessionRound): SpecSession {
  return {
    ...session,
    rounds: [...session.rounds, round],
    status: round.consensusReached ? 'consensus_reached' : 'in_progress',
    completedAt: round.consensusReached ? new Date().toISOString() : undefined,
  };
}

// ============================================================================
// Consensus Detection
// ============================================================================

/**
 * Check if consensus has been reached in a round
 */
export function checkConsensus(
  contributions: AgentContribution[],
  roundType: SpecRoundType
): boolean {
  // Consensus is only checked in CONSENSUS rounds
  if (roundType !== 'CONSENSUS') {
    return false;
  }

  // Need at least 2/3 of agents to have consensus
  const consensusCount = contributions.filter(
    (c) => c.consensus && c.consensus.toLowerCase().includes('approved')
  ).length;

  return consensusCount >= Math.ceil(contributions.length * 0.66);
}

/**
 * Check if session should continue to another round
 */
export function shouldContinueSession(session: SpecSession): boolean {
  // Already reached consensus
  if (session.status === 'consensus_reached') {
    return false;
  }

  // Hit max rounds
  if (session.rounds.length >= MAX_SPEC_ROUNDS) {
    return false;
  }

  // Check if last round was consensus and didn't reach it
  const lastRound = session.rounds[session.rounds.length - 1];
  if (lastRound?.roundType === 'CONSENSUS' && !lastRound.consensusReached) {
    // Allow up to 3 consensus attempts
    const consensusRounds = session.rounds.filter((r: SpecSessionRound) => r.roundType === 'CONSENSUS');
    if (consensusRounds.length >= 3) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Specification Generation
// ============================================================================

/**
 * Generate specification document from session
 */
export function generateSpecification(session: SpecSession): SpecificationDocument {
  const task = session.hydratedContext.taskMetadata;

  // Aggregate contributions
  const allProposals = session.rounds
    .filter((r: SpecSessionRound) => r.roundType === 'PROPOSAL')
    .flatMap((r: SpecSessionRound) => r.contributions)
    .filter((c: AgentContribution) => c.proposal);

  const allConsensus = session.rounds
    .filter((r: SpecSessionRound) => r.roundType === 'CONSENSUS')
    .flatMap((r: SpecSessionRound) => r.contributions)
    .filter((c: AgentContribution) => c.consensus);

  const allChallenges = session.rounds
    .filter((r: SpecSessionRound) => r.roundType === 'CHALLENGE')
    .flatMap((r: SpecSessionRound) => r.contributions);

  // Build specification
  const overview = buildOverview(task, session);
  const technicalApproach = buildTechnicalApproach(allProposals, allConsensus);
  const components = extractComponents(allProposals);
  const interfaces = extractInterfaces(allProposals);
  const integrationPoints = extractIntegrationPoints(allProposals);
  const acceptanceCriteria = extractAcceptanceCriteria(task, allConsensus);
  const testRequirements = extractTestRequirements(allProposals, allChallenges);
  const risks = extractRisks(allChallenges);
  const agentSignoffs = buildSignoffs(session);

  return {
    taskId: task.taskId,
    sessionId: session.sessionId,
    overview,
    technicalApproach,
    components,
    interfaces,
    integrationPoints,
    acceptanceCriteria,
    testRequirements,
    risks,
    agentSignoffs,
    generatedAt: new Date().toISOString(),
  };
}

function buildOverview(task: any, session: SpecSession): string {
  const analyses = session.rounds
    .filter((r: SpecSessionRound) => r.roundType === 'ANALYSIS')
    .flatMap((r: SpecSessionRound) => r.contributions)
    .filter((c: AgentContribution) => c.interpretation);

  if (analyses.length > 0) {
    return analyses[0].interpretation || task.description || 'No overview available.';
  }
  return task.description || 'No overview available.';
}

function buildTechnicalApproach(proposals: AgentContribution[], consensus: AgentContribution[]): string {
  const approaches: string[] = [];

  for (const c of proposals) {
    if (c.proposal) {
      approaches.push(`**${c.agent}:** ${c.proposal}`);
    }
  }

  if (consensus.length > 0) {
    approaches.push('\n**Consensus:**');
    for (const c of consensus) {
      if (c.consensus) {
        approaches.push(`- ${c.agent}: ${c.consensus}`);
      }
    }
  }

  return approaches.join('\n\n') || 'Technical approach to be determined.';
}

function extractComponents(proposals: AgentContribution[]): SpecComponent[] {
  const components: SpecComponent[] = [];

  for (const c of proposals) {
    if (c.proposal) {
      // Extract file mentions as components
      const fileMatches = c.proposal.match(/(?:create|modify|add).*?([a-zA-Z0-9_\-/.]+\.tsx?)/gi);
      if (fileMatches) {
        for (const match of fileMatches) {
          const pathMatch = match.match(/([a-zA-Z0-9_\-/.]+\.tsx?)/);
          if (pathMatch) {
            components.push({
              name: pathMatch[1].split('/').pop() || pathMatch[1],
              type: pathMatch[1].endsWith('.tsx') ? 'Component' : 'Module',
              location: pathMatch[1],
              purpose: `Proposed by ${c.agent}`,
            });
          }
        }
      }
    }
  }

  return components;
}

function extractInterfaces(proposals: AgentContribution[]): string {
  const interfaces: string[] = [];

  for (const c of proposals) {
    // Look for TypeScript interface/type definitions
    const tsMatches = c.proposal?.match(/interface\s+\w+\s*\{[^}]+\}/g);
    if (tsMatches) {
      interfaces.push(...tsMatches);
    }
  }

  return interfaces.length > 0
    ? '```typescript\n' + interfaces.join('\n\n') + '\n```'
    : '// Interfaces to be defined during implementation';
}

function extractIntegrationPoints(proposals: AgentContribution[]): SpecIntegrationPoint[] {
  const points: SpecIntegrationPoint[] = [];

  for (const c of proposals) {
    if (c.dependencies?.length) {
      for (const dep of c.dependencies) {
        points.push({
          integratsWith: dep.split(':')[0] || 'Unknown',
          how: dep,
          contract: 'TBD',
        });
      }
    }
  }

  return points;
}

function extractAcceptanceCriteria(task: any, consensus: AgentContribution[]): string[] {
  const criteria: string[] = [];

  // Start with DoD items
  if (task.definitionOfDone) {
    const dodItems = task.definitionOfDone.split(';').map((d: string) => d.trim()).filter(Boolean);
    criteria.push(...dodItems.map((d: string) => `[ ] ${d}`));
  }

  // Add consensus items
  for (const c of consensus) {
    if (c.consensus) {
      criteria.push(`[ ] ${c.agent} approval: ${c.consensus.slice(0, 100)}`);
    }
  }

  return criteria.length > 0 ? criteria : ['[ ] Implementation complete', '[ ] Tests passing'];
}

function extractTestRequirements(
  proposals: AgentContribution[],
  challenges: AgentContribution[]
): { unitTests: string[]; integrationTests: string[]; edgeCases: string[] } {
  const unitTests: string[] = [];
  const integrationTests: string[] = [];
  const edgeCases: string[] = [];

  for (const c of challenges) {
    if (c.challenges) {
      edgeCases.push(...c.challenges.map((ch: string) => `Test: ${ch}`));
    }
  }

  // Default test requirements
  unitTests.push('Unit tests for new functions');
  integrationTests.push('Integration tests for API endpoints');

  return { unitTests, integrationTests, edgeCases };
}

function extractRisks(challenges: AgentContribution[]): SpecRisk[] {
  const risks: SpecRisk[] = [];

  for (const c of challenges) {
    if (c.concerns?.length) {
      for (const concern of c.concerns) {
        risks.push({
          risk: concern,
          mitigation: 'TBD',
        });
      }
    }
    if (c.challenges?.length) {
      for (const challenge of c.challenges) {
        risks.push({
          risk: challenge,
          mitigation: 'Address during implementation',
        });
      }
    }
  }

  return risks;
}

function buildSignoffs(session: SpecSession): Record<string, boolean> {
  const signoffs: Record<string, boolean> = {};

  const lastConsensusRound = session.rounds
    .filter((r: SpecSessionRound) => r.roundType === 'CONSENSUS')
    .pop();

  if (lastConsensusRound) {
    for (const c of lastConsensusRound.contributions) {
      signoffs[c.agent] = c.consensus?.toLowerCase().includes('approved') || false;
    }
  } else {
    // No consensus round yet
    for (const agent of session.selectedAgents.selectedAgents) {
      signoffs[agent] = false;
    }
  }

  return signoffs;
}

// ============================================================================
// Output Writers
// ============================================================================

/**
 * Write specification to file
 * Uses new unified path structure: .specify/sprints/sprint-{N}/specifications/{TASK_ID}-spec.md
 */
export function writeSpecification(
  spec: SpecificationDocument,
  repoRoot: string,
  sprintNumber: number,
  specifyDir: string = '.specify'
): string {
  const fullSpecifyDir = join(repoRoot, specifyDir);
  const specDir = getSpecificationsDir(fullSpecifyDir, sprintNumber);
  mkdirSync(specDir, { recursive: true });

  const outputPath = getSpecPath(fullSpecifyDir, sprintNumber, spec.taskId);
  const md = generateSpecificationMarkdown(spec);
  writeFileSync(outputPath, md);

  return relative(repoRoot, outputPath);
}

/**
 * Write discussion log to file
 * Uses new unified path structure: .specify/sprints/sprint-{N}/specifications/{TASK_ID}-discussion.md
 */
export function writeDiscussionLog(
  session: SpecSession,
  repoRoot: string,
  sprintNumber: number,
  specifyDir: string = '.specify'
): string {
  const fullSpecifyDir = join(repoRoot, specifyDir);
  const specDir = getSpecificationsDir(fullSpecifyDir, sprintNumber);
  mkdirSync(specDir, { recursive: true });

  const outputPath = getDiscussionPath(fullSpecifyDir, sprintNumber, session.taskId);
  const md = generateDiscussionMarkdown(session);
  writeFileSync(outputPath, md);

  return relative(repoRoot, outputPath);
}

/**
 * Generate specification markdown
 */
export function generateSpecificationMarkdown(spec: SpecificationDocument): string {
  let md = `# Specification: ${spec.taskId}

**Session ID:** ${spec.sessionId}
**Generated:** ${spec.generatedAt}

---

## Overview

${spec.overview}

---

## Technical Approach

${spec.technicalApproach}

---

## Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
${spec.components.map((c: SpecComponent) => `| ${c.name} | ${c.type} | ${c.location} | ${c.purpose} |`).join('\n')}

---

## Interfaces & Contracts

${spec.interfaces}

---

## Integration Points

| Integrates With | How | Contract |
|-----------------|-----|----------|
${spec.integrationPoints.map((p: SpecIntegrationPoint) => `| ${p.integratsWith} | ${p.how} | ${p.contract} |`).join('\n')}

---

## Acceptance Criteria

${spec.acceptanceCriteria.join('\n')}

---

## Test Requirements

### Unit Tests
${spec.testRequirements.unitTests.map((t: string) => `- ${t}`).join('\n')}

### Integration Tests
${spec.testRequirements.integrationTests.map((t: string) => `- ${t}`).join('\n')}

### Edge Cases
${spec.testRequirements.edgeCases.map((t: string) => `- ${t}`).join('\n')}

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
${spec.risks.map((r: SpecRisk) => `| ${r.risk} | ${r.mitigation} |`).join('\n')}

---

## Agent Sign-offs

${Object.entries(spec.agentSignoffs).map(([agent, approved]) => `- [${approved ? 'x' : ' '}] ${agent}`).join('\n')}

---

*Generated by MATOP Spec Session*
`;

  return md;
}

/**
 * Generate discussion log markdown
 */
export function generateDiscussionMarkdown(session: SpecSession): string {
  let md = `# Discussion Log: ${session.taskId}

**Session ID:** ${session.sessionId}
**Status:** ${session.status}
**Started:** ${session.startedAt}
**Completed:** ${session.completedAt || 'In progress'}

---

## Participating Agents

${session.selectedAgents.selectedAgents.map((a: string) => `- ${a}`).join('\n')}

---

## Rounds

`;

  for (const round of session.rounds) {
    md += `### Round ${round.roundNumber}: ${round.roundType}

**Topic:** ${round.topic}
**Started:** ${round.startedAt}
**Completed:** ${round.completedAt || 'In progress'}
**Consensus Reached:** ${round.consensusReached ? 'Yes' : 'No'}

#### Contributions

`;

    for (const contrib of round.contributions) {
      md += `##### ${contrib.agent}

`;
      if (contrib.interpretation) md += `**Interpretation:** ${contrib.interpretation}\n\n`;
      if (contrib.questions?.length) md += `**Questions:**\n${contrib.questions.map((q: string) => `- ${q}`).join('\n')}\n\n`;
      if (contrib.concerns?.length) md += `**Concerns:**\n${contrib.concerns.map((c: string) => `- ${c}`).join('\n')}\n\n`;
      if (contrib.proposal) md += `**Proposal:** ${contrib.proposal}\n\n`;
      if (contrib.challenges?.length) md += `**Challenges:**\n${contrib.challenges.map((c: string) => `- ${c}`).join('\n')}\n\n`;
      if (contrib.consensus) md += `**Consensus:** ${contrib.consensus}\n\n`;
    }

    md += '---\n\n';
  }

  return md;
}

// ============================================================================
// Exports
// ============================================================================

export { MAX_SPEC_ROUNDS, ROUND_TOPICS, ROUND_SEQUENCE };
