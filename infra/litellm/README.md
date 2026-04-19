# LiteLLM Proxy — Operator Guide

Single OpenAI-compatible gateway for all IntelliFlow CRM AI chains. All
LangChain / CrewAI chains point `OPENAI_BASE_URL` at this proxy instead of
directly at provider APIs.

Upstream docs: https://docs.litellm.ai/docs/proxy/deploy

---

## Prerequisites

- Docker Desktop running
- Root `.env` populated (copy from `.env.example`, fill in the keys you need)

---

## Start the proxy

```bash
docker compose -f infra/docker/docker-compose.litellm.yml up -d
```

The proxy starts on **http://localhost:4000**.

## Verify it is running

```bash
# Health check
curl http://localhost:4000/health/liveliness

# List available models (requires master key)
curl http://localhost:4000/v1/models \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY"
```

## Configure ai-worker to use the proxy

In `apps/ai-worker/.env`, set:

```
OPENAI_BASE_URL=http://localhost:4000/v1
OPENAI_API_KEY=$LITELLM_MASTER_KEY
```

LangChain's `ChatOpenAI` and `OpenAIEmbeddings` will then route every call
through the proxy. The model name you pass (e.g. `scoring-free`) maps to the
entry in `infra/litellm/config.yaml`.

---

## Model tiers

| Tier     | Use case           | Example model name      |
| -------- | ------------------ | ----------------------- |
| free     | Dev / high-volume  | `scoring-free`          |
| standard | Paid, low-cost     | `reasoning-standard`    |
| premium  | Highest capability | `qualification-premium` |
| rag-free | Local embeddings   | `rag-free`              |

See `infra/litellm/config.yaml` for the full list.

---

## Add a provider or model

1. Open `infra/litellm/config.yaml`.
2. Add a new entry under `model_list` following the existing pattern.
3. Add the provider's API key to `.env` (and `.env.example` with an empty
   value).
4. Restart the proxy:
   `docker compose -f infra/docker/docker-compose.litellm.yml restart litellm`

Provider model IDs: https://docs.litellm.ai/docs/providers

---

## Stop the proxy

```bash
docker compose -f infra/docker/docker-compose.litellm.yml down
```
