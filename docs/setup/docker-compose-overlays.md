# Docker Compose: Base + Overlays (Low-RAM Friendly)

This repo is structured so you can keep the **base infrastructure** running
(Postgres/Redis) while only starting **heavy services** (Ollama, SonarQube,
observability) when you need them. Data is persisted using **named volumes**, so
stopping containers frees RAM without losing state.

## Compose Files

- `docker-compose.yml`: base (Postgres/Redis) + optional dev tools via profile
  `tools`
- `docker-compose.ollama.yml`: Ollama overlay (local model runtime)
- `docker-compose.sonarqube.yml`: SonarQube stack (separate)

## Common Commands

Start only what you need:

```bash
# Base infra (recommended for day-to-day dev)
docker compose up -d postgres redis

# Optional test containers (used by integration tests)
docker compose up -d postgres-test redis-test

# Optional admin tools (Adminer, RedisInsight, Mailhog)
docker compose --profile tools up -d adminer redis-insight mailhog

# Optional Ollama
docker compose -f docker-compose.yml -f docker-compose.ollama.yml up -d ollama

# Optional SonarQube
docker compose -f docker-compose.sonarqube.yml up -d
```

Stop heavy services without deleting data:

```bash
docker compose stop
```

Remove containers but keep volumes (data):

```bash
docker compose down
```

Destroy volumes too (data loss):

```bash
docker compose down -v
```

## Windows + WSL2 Note

Bind-mounting source code from the Windows filesystem into containers can be
slow. For best performance, keep the repo inside the WSL2 Linux filesystem and
run Docker from there.
