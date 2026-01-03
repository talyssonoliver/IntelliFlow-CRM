# Context Pack: IFC-021 - CrewAI Agent Framework

**Task ID**: IFC-021
**Generated**: 2026-01-01T03:00:00Z
**Sprint**: 13

## Overview

This context pack provides the necessary context for implementing the CrewAI Agent Framework, which includes:
- Lead qualifier agent
- Email writer agent
- Follow-up agent
- Crew orchestration

## Dependencies

### IFC-020: LangChain Pipeline Design (DONE)

The LangChain pipeline design established:
- Modular chain architecture in `apps/ai-worker/src/chains/`
- Base agent class pattern in `apps/ai-worker/src/agents/base.agent.ts`
- Cost tracking integration via `apps/ai-worker/src/utils/cost-tracker.ts`
- AI configuration management in `apps/ai-worker/src/config/ai.config.ts`

## Key Files Read

### 1. apps/ai-worker/src/agents/base.agent.ts

Base agent class providing:
- `AgentContext` - User/session context
- `AgentTask` - Task definition with Zod schema validation
- `AgentResult` - Result with confidence, reasoning, metadata
- `BaseAgentConfig` - Agent configuration (name, role, goal, backstory)
- `BaseAgent` abstract class with execute(), calculateConfidence(), invokeLLM()

### 2. apps/ai-worker/src/agents/crew.ts

Crew orchestration skeleton providing:
- `CrewConfig` - Crew configuration with process type (sequential/hierarchical/parallel)
- `CrewTask` - Multi-agent task definition
- `CrewResult` - Aggregated result from all agents
- `Crew` class with execute() method (stub implementations)

### 3. apps/ai-worker/src/agents/qualification.agent.ts

Lead qualification agent providing:
- `QualificationInput` - Lead data input schema
- `QualificationOutput` - Qualification result schema with confidence, reasoning
- `LeadQualificationAgent` - Full implementation extending BaseAgent

### 4. docs/planning/adr/ADR-006-agent-tools.md

Architecture decision for agent tool-calling:
- Hybrid approach: tRPC tools + approval middleware + LangChain integration
- Human-in-the-loop approval for high-risk actions
- Audit logging for all tool executions
- Rollback support for reversible actions

### 5. artifacts/sprint0/codex-run/Framework.md

STOA Framework v4.3 defining:
- STOA categories and responsibilities
- Gate profiles and validation requirements
- Evidence integrity requirements
- Intelligence STOA owns AI/ML logic, chains/agents, safety/guardrails

## Key Invariants

1. **Type Safety**: All LLM inputs/outputs use Zod schemas for validation
2. **Cost Control**: Every LLM invocation tracks tokens and costs
3. **Human-in-the-Loop**: AI outputs include confidence scores; allow human override when confidence < 0.5
4. **Performance Targets**: AI scoring <2s per lead (p95)
5. **Hexagonal Architecture**: Agent domain logic has no infrastructure dependencies
6. **Structured Output**: All agent outputs must be parseable and validated
7. **Audit Trail**: All agent executions are logged with full context

## Required Artifacts

1. `artifacts/misc/crew-config.yaml` - Crew and agent configuration
2. `artifacts/logs/agent-interaction-logs.json` - Agent interaction logging structure
3. `apps/api/src/agent/orchestration-test.ts` - Orchestration tests

## Implementation Approach

1. Extend existing BaseAgent for new agent types (EmailWriter, FollowUp)
2. Implement crew orchestration methods (sequential, parallel, hierarchical)
3. Create configuration YAML for agent/crew setup
4. Create structured logging for agent interactions
5. Write comprehensive tests for orchestration flows
