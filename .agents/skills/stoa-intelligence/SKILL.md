---
name: stoa-intelligence
description: Execute Intelligence STOA validation for AI/ML logic, LangChain/CrewAI chains, prompt engineering, embeddings, and AI safety guardrails.
---

# Intelligence STOA Sub-Agent

Validates AI/ML logic, chain correctness, prompt quality, model configuration, and safety guardrails.

## Responsibility

- AI/ML logic validation
- LangChain/CrewAI chain correctness
- Prompt engineering quality
- Embedding and vector operations
- Model provider configuration (Ollama, OpenAI)
- AI safety and guardrails
- Evaluation hooks
- Scoring and prediction accuracy

## Gate Table

| # | Gate | Command | Condition |
|---|------|---------|-----------|
| 1 | AI worker unit tests | `pnpm --filter ai-worker test` | Always |
| 2 | Chain evaluation tests | `pnpm --filter ai-worker test:chains` | Always |
| 3 | Prompt template linting | `tsx tools/ai/validate-prompts.ts` | If prompts dir exists |
| 4 | Ollama model availability | `ollama list` | If ollama installed |
| 5 | Langfuse audit | Via ops playbook | If `LANGFUSE_SECRET_KEY` set |
| 6 | Garak adversarial testing | Via ops playbook | If `RUN_GARAK=true` |

**See references/gate-definitions.md** for full commands, log paths, AI-specific validations, and execution code.

## AI-Specific Validations

- Chain output format correctness (JSON where specified)
- Embedding dimensions match vector store config
- Scoring chains return values in range 0-100
- All prompts have system message defined
- No hardcoded PII in prompts
- Temperature and max_tokens within bounds
- Rate limiting configured for AI endpoints
- Token budgets enforced
- Human-in-the-loop checkpoints for high-risk operations

## Trigger Conditions

**Primary STOA**: `AI-*`, `AI-SETUP-*` task prefixes

**Supporting STOA** by keywords: `prompt`, `agent`, `chain`, `embedding`, `vector`, `scoring`, `llm`, `ollama`, `openai`, `langchain`, `crewai`, `model`, `eval`

**Supporting STOA** by path: `apps/ai-worker/**`, `**/prompts/**`, `**/chains/**`, `**/agents/**`, `**/embeddings/**`, `**/scoring/**`

## Verdict Logic

| Condition | Verdict |
|---|---|
| AI tests pass, prompts valid, models configured | PASS |
| AI tests fail | FAIL |
| Chain produces invalid output format | FAIL |
| Safety guardrail missing for high-risk operation | FAIL |
| Prompt validation warnings | FAIL |
| Model not available (dev environment) | FAIL (document gap) |

**Note**: There is NO WARN verdict. All gates are binary (PASS/FAIL/NEEDS_HUMAN only).

## Output

Write verdict JSON to:
`artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Intelligence.json`

**See references/gate-definitions.md** for full verdict JSON schema with aiMetrics and execution code.

## Usage

```
/stoa-intelligence <TASK_ID> [RUN_ID]
```

- `TASK_ID` (required): Task ID being validated
- `RUN_ID` (optional): Run ID from MATOP orchestrator
