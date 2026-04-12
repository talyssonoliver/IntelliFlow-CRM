# EasyPanel Setup Guide for IntelliFlow CRM

This guide covers the deployment of internal monitoring tools on EasyPanel.

## Security Warning

**CRITICAL: Internal tools must NOT be publicly accessible!**

Do NOT use public subdomains (e.g., `prometheus.tools.intelliflow.dev`) without
access control. Anyone could access your metrics, logs, and code analysis.

**Required:** Use Tailscale OR Cloudflare Access (see
[Access Control](#access-control) section).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RAILWAY / VERCEL                              │
│                                                                         │
│  ┌─────────────┐              ┌─────────────┐                          │
│  │  API Server │              │  AI Worker  │                          │
│  │   (tRPC)    │              │ (LangChain) │                          │
│  │             │              │             │                          │
│  │  OTEL SDK   │              │  OTEL SDK   │                          │
│  └──────┬──────┘              └──────┬──────┘                          │
│         │ OTLP/HTTPS                 │ OTLP/HTTPS                       │
└─────────┼────────────────────────────┼──────────────────────────────────┘
          │                            │
          └──────────────┬─────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EASYPANEL SERVER                                 │
│               (Behind Tailscale / Cloudflare Access)                    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                    OTEL COLLECTOR                              │     │
│  │                    :4317 (gRPC) :4318 (HTTP)                   │     │
│  └──────────┬─────────────────┬─────────────────┬────────────────┘     │
│             │                 │                 │                      │
│             ▼                 ▼                 ▼                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐             │
│  │  PROMETHEUS  │    │    LOKI      │    │    TEMPO     │             │
│  │   (metrics)  │    │   (logs)     │    │  (traces)    │             │
│  │    :9090     │    │   :3100      │    │   :3200      │             │
│  └───────┬──────┘    └───────┬──────┘    └───────┬──────┘             │
│          │                   │                   │                     │
│          └───────────────────┼───────────────────┘                     │
│                              ▼                                         │
│                     ┌──────────────┐                                   │
│                     │   GRAFANA    │                                   │
│                     │    :3000     │                                   │
│                     └──────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Services

| Service        | Purpose           | Week | Port       |
| -------------- | ----------------- | ---- | ---------- |
| OTel Collector | Telemetry ingress | 1    | 4317, 4318 |
| Prometheus     | Metrics storage   | 1    | 9090       |
| Grafana        | Visualization     | 1    | 3000       |
| Loki           | Log aggregation   | 2    | 3100       |
| Tempo          | Trace storage     | 2    | 3200       |
| SonarQube      | Code quality      | 3    | 9000       |

## Prerequisites

- Hetzner account (or alternative cloud provider)
- Domain with DNS access (optional if using Tailscale only)
- SSH key pair
- Tailscale account OR Cloudflare account

## Step 1: Provision Server

### Server Sizing

| Phase    | Server | RAM  | Storage | Cost   |
| -------- | ------ | ---- | ------- | ------ |
| Week 1-2 | CPX31  | 8GB  | 160GB   | €15/mo |
| Week 3+  | CPX41  | 16GB | 240GB   | €30/mo |

**Recommendation:** Start with CPX31, resize to CPX41 before adding SonarQube.

### Hetzner Cloud Console

1. Navigate to https://console.hetzner.cloud
2. Create new project: `intelliflow-monitoring`
3. Add Server:
   - **Type**: CPX31 (4 vCPU, 8GB RAM, 160GB SSD)
   - **Image**: Ubuntu 22.04
   - **Location**: fsn1 (Falkenstein) or nbg1 (Nuremberg)
   - **SSH Key**: Add your public key
   - **Firewall**:
     - Allow 22 (SSH)
     - Allow 80, 443 (only if using Cloudflare Access)
     - Block all other inbound (if using Tailscale only)

### Verification

```bash
# Connect to server
ssh root@<SERVER_IP>

# Verify resources
uname -a
free -h
df -h
```

## Step 2: Access Control

### Option A: Tailscale (Recommended for Small Team)

**Cost:** Free for up to 100 devices

```bash
# On EasyPanel server
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up

# Note your Tailscale IP
tailscale ip -4
# Example: 100.64.0.1
```

**On developer machines:**

1. Install Tailscale from https://tailscale.com/download
2. Login with same account
3. Access services via Tailscale IP: `http://100.64.0.1:3000`

**Important:** Do NOT assign public domains to services when using Tailscale.

### Option B: Cloudflare Access (Recommended for Team Access)

**Cost:** Free for up to 50 users

1. Add domain to Cloudflare
2. Go to Zero Trust Dashboard
3. Create Access Application:
   - Application domain: `*.tools.intelliflow.dev`
   - Authentication: GitHub, Google, or email
4. Configure DNS to proxy through Cloudflare

Users must authenticate before accessing any service.

### Verification

```bash
# Services should NOT be publicly accessible
curl https://prometheus.tools.intelliflow.dev
# Expected: 403 Forbidden (Cloudflare) or timeout (Tailscale)
```

## Step 3: Configure DNS (Optional - Cloudflare Access only)

Skip this step if using Tailscale only.

| Type | Host                     | Value         | Proxy |
| ---- | ------------------------ | ------------- | ----- |
| A    | tools.intelliflow.dev    | `<SERVER_IP>` | Yes   |
| A    | \*.tools.intelliflow.dev | `<SERVER_IP>` | Yes   |

## Step 4: Install EasyPanel

```bash
# SSH into server
ssh root@<SERVER_IP>

# Update system first
apt update && apt upgrade -y

# Install EasyPanel (one command)
curl -sSL https://get.easypanel.io | sh
```

### Post-Install

Access EasyPanel via:

- **Tailscale:** `http://100.x.x.x:3000`
- **Cloudflare:** `https://easypanel.tools.intelliflow.dev:3000`

1. Set admin password (store in HashiCorp Vault)
2. Verify installation:

```bash
docker node ls       # Should show Swarm manager
docker service ls    # Should show easypanel services
```

## Step 5: Create Project

1. Click "New Project"
2. Name: `intelliflow-monitoring`
3. Note the Project ID for audit records

## Week 1: Core Pipeline

### Deploy OTel Collector (First!)

| Field        | Value                                       |
| ------------ | ------------------------------------------- |
| Service Name | otel-collector                              |
| Image        | otel/opentelemetry-collector-contrib:0.91.0 |

**Ports:**

- 4317 (gRPC OTLP)
- 4318 (HTTP OTLP)
- 8888 (Prometheus metrics)
- 13133 (Health check)

**Volume:** | Name | Mount Path | | ----------------- |
--------------------------------- | | otel-config |
/etc/otelcol-contrib/config.yaml |

**Command:**

```
--config=/etc/otelcol-contrib/config.yaml
```

**Config:** Copy `../monitoring/otel-collector.yaml` to the service.

**Verification:**

```bash
curl http://localhost:13133/  # Health check
curl http://localhost:8888/metrics  # Collector metrics
```

### Deploy Prometheus

| Field        | Value                   |
| ------------ | ----------------------- |
| Service Name | prometheus              |
| Image        | prom/prometheus:v2.48.0 |

**Volumes:**

| Name              | Mount Path      |
| ----------------- | --------------- |
| prometheus-data   | /prometheus     |
| prometheus-config | /etc/prometheus |

**Command (IMPORTANT - includes remote-write receiver):**

```
--config.file=/etc/prometheus/prometheus.yml
--storage.tsdb.path=/prometheus
--storage.tsdb.retention.time=30d
--storage.tsdb.retention.size=10GB
--web.enable-remote-write-receiver
--web.enable-lifecycle
```

**Config:** Copy `../monitoring/prometheus.yml` to the service.

**Verification:**

```bash
curl http://localhost:9090/-/ready
curl http://localhost:9090/api/v1/status/config
```

### Deploy Grafana

| Field        | Value                      |
| ------------ | -------------------------- |
| Service Name | grafana                    |
| Image        | grafana/grafana-oss:10.2.3 |

**Environment Variables:**

```
GF_SECURITY_ADMIN_PASSWORD=<from-vault>
GF_SECURITY_ADMIN_USER=admin
GF_USERS_ALLOW_SIGN_UP=false
GF_AUTH_ANONYMOUS_ENABLED=false
```

**Volumes:**

| Name                 | Mount Path                |
| -------------------- | ------------------------- |
| grafana-data         | /var/lib/grafana          |
| grafana-provisioning | /etc/grafana/provisioning |

**Provisioning:** Copy `../monitoring/grafana/provisioning/` directory contents.

**Verification:**

```bash
curl http://localhost:3000/api/health
```

## Week 2: Logs + Traces

### Deploy Loki

| Field        | Value              |
| ------------ | ------------------ |
| Service Name | loki               |
| Image        | grafana/loki:2.9.3 |

**Volumes:**

| Name        | Mount Path |
| ----------- | ---------- |
| loki-data   | /loki      |
| loki-config | /etc/loki  |

**Command:**

```
-config.file=/etc/loki/config.yml
```

**Config:** Copy `../monitoring/loki-config.yml` to the service.

**Verification:**

```bash
curl http://localhost:3100/ready
```

### Deploy Tempo

| Field        | Value               |
| ------------ | ------------------- |
| Service Name | tempo               |
| Image        | grafana/tempo:2.3.1 |

**Ports:**

- 3200 (HTTP API)
- 4317 (OTLP gRPC from collector)

**Volumes:**

| Name         | Mount Path |
| ------------ | ---------- |
| tempo-data   | /var/tempo |
| tempo-config | /etc/tempo |

**Command:**

```
-config.file=/etc/tempo/config.yml
```

**Config:** Copy `../monitoring/tempo-config.yml` to the service.

**Verification:**

```bash
curl http://localhost:3200/ready
```

## Week 3: Code Quality

### Resize Server

Before adding SonarQube, resize to CPX41 (16GB RAM):

1. In Hetzner Console, select server
2. Power off
3. Resize to CPX41
4. Power on
5. Verify: `free -h` shows 16GB

### Deploy PostgreSQL (for SonarQube)

| Field        | Value       |
| ------------ | ----------- |
| Service Name | sonar-db    |
| Image        | postgres:15 |

**Environment:**

```
POSTGRES_USER=sonarqube
POSTGRES_PASSWORD=<from-vault>
POSTGRES_DB=sonarqube
```

### Configure Kernel for SonarQube

```bash
# On EasyPanel server
echo "vm.max_map_count=262144" >> /etc/sysctl.conf
sysctl -p
```

### Deploy SonarQube

| Field        | Value                  |
| ------------ | ---------------------- |
| Service Name | sonarqube              |
| Image        | sonarqube:10-community |

**Environment:**

```
SONAR_JDBC_URL=jdbc:postgresql://sonar-db:5432/sonarqube
SONAR_JDBC_USERNAME=sonarqube
SONAR_JDBC_PASSWORD=<from-vault>
```

**Volumes:**

| Name       | Mount Path          |
| ---------- | ------------------- |
| sonar-data | /opt/sonarqube/data |
| sonar-logs | /opt/sonarqube/logs |

## Connecting Railway/Vercel Apps

Apps push telemetry via OTLP to the OTel Collector:

### Railway Environment Variables

```bash
# OTel configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://<tailscale-ip>:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_SERVICE_NAME=intelliflow-api
OTEL_RESOURCE_ATTRIBUTES=service.namespace=intelliflow,deployment.environment=production

# If using Cloudflare Access, add auth headers
# OTEL_EXPORTER_OTLP_HEADERS=cf-access-client-id=xxx,cf-access-client-secret=xxx
```

### Testing OTLP Push

```bash
# Send test trace
curl -X POST http://<tailscale-ip>:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'

# Expected: 200 OK
```

## Backup Strategy

See `backup.sh` for weekly backup script.

```bash
# Schedule backup cron job
crontab -e
# Add: 0 3 * * 0 /root/backup.sh
```

**Retention:**

| Service    | Retention  |
| ---------- | ---------- |
| Prometheus | 30 days    |
| Loki       | 30 days    |
| Tempo      | 7 days     |
| Grafana    | Indefinite |
| SonarQube  | 90 days    |

## Local Development

Use the same configs locally with Docker Compose:

```bash
cd infra/monitoring
docker-compose -f docker-compose.monitoring.yml up -d

# Access:
# Grafana: http://localhost:3001 (admin/admin)
# Push OTLP: http://localhost:4318
```

## Troubleshooting

### Service not accessible

1. Verify access control (Tailscale connected? CF Access authenticated?)
2. Check Docker service: `docker service ls`
3. Check service logs: `docker service logs intelliflow-monitoring_<service>`

### OTel Collector not receiving data

1. Check collector health: `curl http://localhost:13133/`
2. Check collector logs for OTLP errors
3. Verify firewall allows 4317/4318

### Prometheus not receiving metrics from Collector

1. Verify `--web.enable-remote-write-receiver` flag is set
2. Check collector logs for prometheusremotewrite errors
3. Test: `curl http://localhost:9090/api/v1/write` (should return error,
   not 404)

### Grafana datasource connection failed

1. Verify internal service names (prometheus:9090, loki:3100, tempo:3200)
2. Test from Grafana container: `curl http://prometheus:9090/-/ready`
3. Check datasource UID matches in provisioning

## References

- [EasyPanel Docs](https://easypanel.io/docs)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [Prometheus Docs](https://prometheus.io/docs)
- [Grafana Docs](https://grafana.com/docs)
- [Loki Docs](https://grafana.com/docs/loki)
- [Tempo Docs](https://grafana.com/docs/tempo)
- [SonarQube Docs](https://docs.sonarqube.org)
- [Tailscale Docs](https://tailscale.com/kb)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/)
