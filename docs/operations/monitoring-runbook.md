# Monitoring Stack Operations Runbook

**Task ID**: EP-001-AI **Last Updated**: 2025-12-19 **Owner**: DevOps + Claude
Code

## Overview

IntelliFlow CRM uses a push-based OTLP pipeline for observability, designed for
Railway/Vercel deployments where scraping is not possible.

```
Apps (Railway/Vercel) --OTLP--> OTel Collector --> Prometheus/Loki/Tempo --> Grafana
```

## Services

| Service        | Local URL             | Port | Purpose                    |
| -------------- | --------------------- | ---- | -------------------------- |
| Grafana        | http://localhost:3001 | 3001 | Dashboards & visualization |
| Prometheus     | http://localhost:9090 | 9090 | Metrics storage (30d)      |
| Loki           | http://localhost:3100 | 3100 | Log aggregation (30d)      |
| Tempo          | http://localhost:3200 | 3200 | Distributed tracing (7d)   |
| OTel Collector | http://localhost:4318 | 4318 | OTLP HTTP receiver         |

## Quick Start

### Start Monitoring Stack

```bash
cd infra/monitoring
docker compose -f docker-compose.monitoring.yml up -d
```

### Stop Monitoring Stack

```bash
cd infra/monitoring
docker compose -f docker-compose.monitoring.yml down
```

### View Logs

```bash
# All services
docker compose -f docker-compose.monitoring.yml logs -f

# Specific service
docker logs -f intelliflow-grafana
docker logs -f intelliflow-prometheus
docker logs -f intelliflow-loki
docker logs -f intelliflow-tempo
docker logs -f intelliflow-otel-collector
```

## Health Checks

### Manual Health Check

```bash
# All services
curl -s http://localhost:3001/api/health    # Grafana
curl -s http://localhost:9090/-/ready       # Prometheus
curl -s http://localhost:3100/ready         # Loki
curl -s http://localhost:3200/ready         # Tempo
curl -s http://localhost:13133/             # OTel Collector
```

### Expected Output

All endpoints should return HTTP 200.

## Access Control

### Local Development

- **Grafana**: admin/admin (change in production!)
- **Other services**: No authentication (internal network only)

### Production (EasyPanel)

- Use Tailscale for internal access
- Or Cloudflare Access for external access
- **NEVER expose services without authentication**

## Retention Settings

| Data Type | Retention | Config File                                          |
| --------- | --------- | ---------------------------------------------------- |
| Metrics   | 30 days   | prometheus.yml (`--storage.tsdb.retention.time=30d`) |
| Logs      | 30 days   | loki-config.yml (`retention_period: 720h`)           |
| Traces    | 7 days    | tempo-config.yml (`block_retention: 168h`)           |

## Sending Telemetry

### From Railway/Vercel Apps

Set these environment variables:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://<tailscale-ip>:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_SERVICE_NAME=intelliflow-api
OTEL_RESOURCE_ATTRIBUTES=service.namespace=intelliflow,deployment.environment=production
```

### Test OTLP Push

```bash
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"test"}}]},"scopeSpans":[{"scope":{"name":"test"},"spans":[{"traceId":"01020304050607080910111213141516","spanId":"0102030405060708","name":"test-span","startTimeUnixNano":"1702000000000000000","endTimeUnixNano":"1702000001000000000"}]}]}]}'
```

Expected: `{"partialSuccess":{}}`

## Troubleshooting

### Container Won't Start

1. Check logs: `docker logs <container-name>`
2. Validate config: `docker compose config -q`
3. Check port conflicts: `netstat -an | grep <port>`

### OTel Collector Errors

Common issues:

- Invalid YAML syntax
- Unsupported exporter options
- Network connectivity to backends

Fix:

```bash
docker restart intelliflow-otel-collector
docker logs -f intelliflow-otel-collector
```

### Tempo Errors

Common issues:

- Deprecated config fields
- Invalid schema version

Check for errors:

```bash
docker logs intelliflow-tempo | grep -i error
```

### No Data in Grafana

1. Check datasource connectivity: Grafana > Configuration > Data Sources > Test
2. Verify OTel Collector is receiving data:
   `docker logs intelliflow-otel-collector`
3. Check Prometheus targets: http://localhost:9090/targets

## Config Files

All configs are in `infra/monitoring/`:

| File                          | Purpose                      |
| ----------------------------- | ---------------------------- |
| docker-compose.monitoring.yml | Service definitions          |
| prometheus.yml                | Prometheus scrape config     |
| loki-config.yml               | Loki storage & retention     |
| tempo-config.yml              | Tempo tracing config         |
| otel-collector.yaml           | OTel pipelines               |
| grafana/provisioning/         | Auto-provisioned datasources |

## Config Hashes

For audit purposes, all config hashes are tracked in:

```
artifacts/monitoring-config-hashes.txt
```

Regenerate after config changes:

```bash
sha256sum infra/monitoring/*.yml infra/monitoring/*.yaml > artifacts/monitoring-config-hashes.txt
```

## Backup & Recovery

### Backup Data Volumes

```bash
# Create backup directory
mkdir -p backups/monitoring

# Backup volumes
docker run --rm -v intelliflow-prometheus-data:/data -v $(pwd)/backups/monitoring:/backup alpine tar cvf /backup/prometheus-$(date +%Y%m%d).tar /data
docker run --rm -v intelliflow-grafana-data:/data -v $(pwd)/backups/monitoring:/backup alpine tar cvf /backup/grafana-$(date +%Y%m%d).tar /data
```

### Restore Data

```bash
docker compose -f docker-compose.monitoring.yml down
docker run --rm -v intelliflow-prometheus-data:/data -v $(pwd)/backups/monitoring:/backup alpine tar xvf /backup/prometheus-YYYYMMDD.tar -C /
docker compose -f docker-compose.monitoring.yml up -d
```

## Scaling (EasyPanel)

### Initial Setup (Week 1-2)

- Server: CPX31 (8GB RAM)
- Services: OTel, Prometheus, Grafana, Loki, Tempo
- Cost: ~€16/month

### With SonarQube (Week 3+)

- Server: CPX41 (16GB RAM)
- Add: SonarQube + PostgreSQL
- Cost: ~€31/month

## Contacts

- **On-call**: DevOps team
- **Escalation**: Platform lead
- **Documentation**: `docs/operations/`
