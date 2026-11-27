# Embedding outage (handled fallback)

Alert: **Embedding fallback active for 1 hour** (uid
`ifc074-embedding-outage-1h`,
`infra/monitoring/grafana/cloud/alert-rules.json`), severity warning, emails the
owner.

## What it means

Semantic search embeds the query; when that call fails the ai-worker falls back
to full-text search (`apps/ai-worker/src/lib/handled-fallback.ts`). Searches
still return results, so no error span or error log is raised (PR #1561). The
counter `intelliflow_ai_fallback_handled_total{fallback="embedding_to_fts"}`
counts each recovered failure. The alert fires when it has increased in every
evaluation for 1 hour: a real outage, not a blip. Results are worse (keyword
match only), not missing.

## Triage

1. Find the model and the error. The counter has no model label; read the
   `llm.embed` span events `llm.embed.failed_handled` (Tempo, service
   `ai-worker`) or the ai-worker warn logs (Loki,
   `{service_name="ai-worker"} |= "embed"`). The message carries the provider
   status (25/11/2026: HTTP 410, the embedding model's end of life).
2. Check the configured embedding model and provider key in the ai-worker
   environment (`EMBEDDING_PROVIDER`, the model name, `OPENAI_API_KEY` or the
   Ollama host).
3. Fix the cause: switch to a supported embedding model, renew the key, or
   restore the provider. A changed model dimension needs the pgvector column
   re-embedded first.
4. Confirm recovery: the query below returns 0 and the alert resolves after the
   next evaluation.

```promql
sum by (fallback) (increase(intelliflow_ai_fallback_handled_total[5m]))
```

## Notes

- The hour restarts if a 5-minute window has no failed call (low traffic). A
  quiet alert during an outage with no searches is expected.
- Applying a changed rule is the orchestrator's step (workflow
  `grafana-alert-rules.yml`, dispatched from CI), never a local token.
