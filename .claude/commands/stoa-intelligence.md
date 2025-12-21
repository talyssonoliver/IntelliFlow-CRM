# Intelligence STOA Sub-Agent

Execute Intelligence STOA validation for AI/ML logic, chains, agents, and guardrails.

## Usage

```
/stoa-intelligence <TASK_ID> [RUN_ID]
```

## Arguments

- `TASK_ID` (required): The task ID being validated
- `RUN_ID` (optional): The run ID from MATOP orchestrator. If not provided, generates a new one.

## Responsibility

The Intelligence STOA owns:
- AI/ML logic validation
- LangChain/CrewAI chain correctness
- Prompt engineering quality
- Embedding and vector operations
- Model provider configuration
- AI safety and guardrails
- Evaluation hooks
- Scoring and prediction accuracy

## Gate Profile (Mandatory)

Execute these gates in order:

### AI Worker Tests

```bash
# 1. AI worker unit tests
pnpm --filter ai-worker test 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/ai-worker-test.log"

# 2. Chain evaluation tests
pnpm --filter ai-worker test:chains 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/ai-chains-test.log"
```

### Prompt Validation

```bash
# 3. Prompt template linting (if defined)
if [ -d "apps/ai-worker/src/prompts" ]; then
  # Validate prompt templates have required structure
  tsx tools/ai/validate-prompts.ts 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/prompt-validation.log"
fi
```

### Model Configuration Check

```bash
# 4. Verify Ollama models are available (dev environment)
if command -v ollama &> /dev/null; then
  ollama list 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/ollama-models.log"
fi
```

### AI Safety Checks (Tier 3 - Optional)

```bash
# 5. Langfuse audit (if configured)
if [ -n "$LANGFUSE_SECRET_KEY" ]; then
  echo "Langfuse audit: run via ops playbook" | tee "artifacts/reports/system-audit/$RUN_ID/gates/langfuse-audit.log"
fi

# 6. Garak adversarial testing (if enabled)
if [ "$RUN_GARAK" = "true" ]; then
  echo "Garak: run via ops playbook" | tee "artifacts/reports/system-audit/$RUN_ID/gates/garak.log"
fi
```

## AI-Specific Validations

### Chain Correctness

- Verify LangChain chains produce expected output format
- Check embedding dimensions match vector store config
- Validate scoring chains return values in expected range (0-100)

### Prompt Quality

- All prompts have system message defined
- No hardcoded PII in prompts
- Temperature and max_tokens within bounds
- Output format explicitly specified (JSON where applicable)

### Safety Guardrails

- Rate limiting configured for AI endpoints
- Token budgets enforced
- Hallucination detection hooks present (when applicable)
- Human-in-the-loop checkpoints defined for high-risk operations

## Verdict Logic

| Condition | Verdict |
|-----------|---------|
| AI tests pass, prompts valid, models configured | PASS |
| Minor prompt warnings, tests pass | WARN |
| AI tests fail | FAIL |
| Chain produces invalid output format | FAIL |
| Safety guardrail missing for high-risk operation | FAIL |
| Model not available (dev environment) | WARN with waiver |

## Verdict Output

Produce verdict file at: `artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Intelligence.json`

```json
{
  "stoa": "Intelligence",
  "taskId": "<TASK_ID>",
  "verdict": "PASS|WARN|FAIL|NEEDS_HUMAN",
  "rationale": "AI worker tests passed, prompts validated",
  "toolIdsSelected": ["ai-worker-test"],
  "toolIdsExecuted": ["ai-worker-test"],
  "waiversProposed": [],
  "findings": [],
  "aiMetrics": {
    "chainsValidated": 3,
    "promptsChecked": 12,
    "modelsAvailable": ["llama2", "mistral"],
    "guardrailsPresent": true
  },
  "timestamp": "2025-12-20T14:30:00.000Z"
}
```

## When to Trigger

The Intelligence STOA is triggered when:

### By Task Prefix
- `AI-*` tasks
- `AI-SETUP-*` tasks

### By Keywords (Supporting STOA)
- `prompt`, `agent`, `chain`, `embedding`
- `vector`, `scoring`, `llm`, `ollama`
- `openai`, `langchain`, `crewai`
- `model`, `eval`

### By Path Impact
- `apps/ai-worker/**`
- `**/prompts/**`
- `**/chains/**`
- `**/agents/**`
- `**/embeddings/**`
- `**/scoring/**`

## Example Output

```
[Intelligence STOA] Task: AI-SETUP-003
[Intelligence STOA] Running 2 gates...

  [1/2] ai-worker-test... PASS (8.2s)
        - 24 tests passed
        - Chains: scoring.chain, embedding.chain validated

  [2/2] prompt-validation... PASS (1.1s)
        - 12 prompts checked
        - No issues found

[Intelligence STOA] Verdict: PASS
[Intelligence STOA] Rationale: AI worker tests passed, all prompts validated
[Intelligence STOA] Output: artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/Intelligence.json
```

## Related Commands

- `/matop-execute` - MATOP orchestrator (spawns this sub-agent)
- `/stoa-foundation` - Foundation STOA sub-agent
- `/stoa-security` - Security STOA sub-agent
- `/stoa-quality` - Quality STOA sub-agent
