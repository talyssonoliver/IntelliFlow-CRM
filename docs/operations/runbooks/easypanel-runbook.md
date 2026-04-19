# EasyPanel Operations Runbook

This runbook covers operational procedures for the IntelliFlow monitoring stack
deployed on EasyPanel.

## Table of Contents

1. [Service Overview](#service-overview)
2. [Access & Authentication](#access--authentication)
3. [Monitoring Dashboards](#monitoring-dashboards)
4. [Common Operations](#common-operations)
5. [Troubleshooting](#troubleshooting)
6. [Backup & Recovery](#backup--recovery)
7. [Incident Response](#incident-response)
8. [Maintenance Windows](#maintenance-windows)

## Service Overview

| Service    | URL                                      | Purpose       | Health Check  |
| ---------- | ---------------------------------------- | ------------- | ------------- |
| EasyPanel  | https://\<server-ip\>:3000               | Control panel | UI accessible |
| Prometheus | https://prometheus.tools.intelliflow.dev | Metrics       | `/-/ready`    |
| Grafana    | https://grafana.tools.intelliflow.dev    | Dashboards    | `/api/health` |
| Loki       | https://loki.tools.intelliflow.dev       | Logs          | `/ready`      |
| SonarQube  | https://sonar.tools.intelliflow.dev      | Code quality  | UI accessible |

## Access & Authentication

### Credentials

All credentials are stored in HashiCorp Vault:

| Service               | Vault Path                           |
| --------------------- | ------------------------------------ |
| EasyPanel Admin       | `secret/data/intelliflow/easypanel`  |
| Grafana Admin         | `secret/data/intelliflow/grafana`    |
| Prometheus Basic Auth | `secret/data/intelliflow/prometheus` |
| SonarQube Admin       | `secret/data/intelliflow/sonarqube`  |

### Accessing Vault

```bash
# Set Vault address
export VAULT_ADDR="http://127.0.0.1:8200"

# Login (dev mode uses root token)
vault login <root-token>

# Read credentials
vault kv get secret/intelliflow/grafana
```

## Monitoring Dashboards

### Key Dashboards

| Dashboard        | Purpose         | Alert Threshold      |
| ---------------- | --------------- | -------------------- |
| IntelliFlow Main | System overview | N/A                  |
| API Performance  | Response times  | p99 > 200ms          |
| Error Rates      | 5xx errors      | > 1% for 5min        |
| Resource Usage   | CPU/Memory      | CPU > 80%, Mem > 85% |

### Accessing Dashboards

1. Navigate to https://grafana.tools.intelliflow.dev
2. Login with admin credentials
3. Select dashboard from left sidebar

## Common Operations

### Restart a Service

```bash
# SSH to EasyPanel server
ssh root@<server-ip>

# List services
docker service ls

# Restart specific service
docker service update --force intelliflow-monitoring_<service>

# Example: Restart Prometheus
docker service update --force intelliflow-monitoring_prometheus
```

### View Service Logs

**Via EasyPanel UI:**

1. Navigate to Project > Service
2. Click "Logs" tab

**Via SSH:**

```bash
# View last 100 lines
docker service logs --tail 100 intelliflow-monitoring_prometheus

# Follow logs
docker service logs -f intelliflow-monitoring_prometheus
```

### Scale a Service

```bash
# Scale up
docker service scale intelliflow-monitoring_grafana=2

# Scale down
docker service scale intelliflow-monitoring_grafana=1
```

Note: Only scale stateless services. Prometheus and Loki require special
federation/clustering for HA.

### Update Service Image

**Via EasyPanel UI:**

1. Navigate to Project > Service
2. Edit service
3. Update image tag
4. Deploy

**Via SSH:**

```bash
docker service update --image grafana/grafana-oss:12.1.0 intelliflow-monitoring_grafana
```

### Check Disk Space

```bash
# System disk usage
df -h

# Docker disk usage
docker system df

# Volume sizes
docker system df -v | grep -A20 "Volumes"
```

### Clean Up Docker

```bash
# Remove unused images (safe)
docker image prune -f

# Remove all unused resources (be careful)
docker system prune -f

# Remove unused volumes (data loss warning!)
# docker volume prune -f
```

## Troubleshooting

### Service Not Accessible

**Symptoms:** 502/503 errors, connection timeout

**Steps:**

1. Check if service is running:

   ```bash
   docker service ps intelliflow-monitoring_<service>
   ```

2. Check Traefik routing:

   ```bash
   docker service logs intelliflow-monitoring_traefik 2>&1 | tail -50
   ```

3. Check DNS resolution:

   ```bash
   dig +short <service>.tools.intelliflow.dev
   ```

4. Check SSL certificate:
   ```bash
   curl -vI https://<service>.tools.intelliflow.dev
   ```

### Prometheus Not Scraping

**Symptoms:** No data in Grafana, targets showing DOWN

**Steps:**

1. Check targets: https://prometheus.tools.intelliflow.dev/targets

2. Verify service is reachable:

   ```bash
   # From Prometheus container
   docker exec -it $(docker ps -q -f name=prometheus) wget -qO- http://grafana:3000/metrics
   ```

3. Check Prometheus config:
   ```bash
   curl -u admin:pass https://prometheus.tools.intelliflow.dev/api/v1/status/config
   ```

### Grafana Datasource Connection Failed

**Symptoms:** "Data source is not working" error

**Steps:**

1. Verify internal connectivity:

   ```bash
   # From Grafana container
   docker exec -it $(docker ps -q -f name=grafana) wget -qO- http://prometheus:9090/-/ready
   ```

2. Check datasource configuration in Grafana UI

3. Verify network policy in EasyPanel

### High Memory Usage

**Symptoms:** OOM kills, slow response

**Steps:**

1. Check container stats:

   ```bash
   docker stats --no-stream
   ```

2. Identify memory hogs:

   ```bash
   docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"
   ```

3. Adjust resource limits in EasyPanel service settings

4. For Prometheus, consider reducing retention:
   ```
   --storage.tsdb.retention.time=15d
   --storage.tsdb.retention.size=5GB
   ```

### SSL Certificate Issues

**Symptoms:** Certificate expired, invalid cert

**Steps:**

1. Check certificate:

   ```bash
   echo | openssl s_client -servername <domain> -connect <domain>:443 2>/dev/null | openssl x509 -noout -dates
   ```

2. Force certificate renewal (Traefik/Let's Encrypt):

   ```bash
   # Remove old cert
   docker exec -it $(docker ps -q -f name=traefik) rm /letsencrypt/acme.json

   # Restart Traefik
   docker service update --force intelliflow-monitoring_traefik
   ```

## Backup & Recovery

### Manual Backup

```bash
# Run backup script
/root/backup.sh

# Or run from infra/easypanel/backup.sh on development machine
```

### Verify Backups

```bash
# List backups
ls -la /backups/

# Verify checksums
cd /backups/<date>
sha256sum -c checksums.sha256
```

### Restore from Backup

```bash
# Stop service first
docker service scale intelliflow-monitoring_prometheus=0

# Restore volume
docker run --rm \
    -v prometheus-data:/data \
    -v /backups/<date>:/backup \
    alpine tar xzf /backup/prometheus-<date>.tar.gz -C /data

# Start service
docker service scale intelliflow-monitoring_prometheus=1
```

## Incident Response

### Severity Levels

| Level | Definition        | Response Time | Examples                             |
| ----- | ----------------- | ------------- | ------------------------------------ |
| P1    | Complete outage   | 15 min        | All services down, data loss         |
| P2    | Major degradation | 1 hour        | Single service down, high error rate |
| P3    | Minor issue       | 4 hours       | Slow response, dashboard issue       |
| P4    | Cosmetic          | 24 hours      | UI glitch, non-critical feature      |

### P1 Response Procedure

1. **Assess** - Determine scope of outage
2. **Communicate** - Notify stakeholders
3. **Contain** - Prevent further damage
4. **Recover** - Restore service
5. **Document** - Create incident report

### Escalation Path

1. On-call engineer
2. DevOps lead
3. CTO

## Maintenance Windows

### Scheduled Maintenance

- **Weekly**: Sundays 03:00-05:00 UTC
- **Monthly**: First Sunday, full backup verification

### Pre-Maintenance Checklist

- [ ] Notify stakeholders 24h in advance
- [ ] Create fresh backup
- [ ] Verify backup integrity
- [ ] Document current state
- [ ] Prepare rollback plan

### Post-Maintenance Checklist

- [ ] Verify all services healthy
- [ ] Check monitoring dashboards
- [ ] Verify data integrity
- [ ] Update documentation
- [ ] Send completion notification

## Contact Information

| Role           | Contact            | Escalation         |
| -------------- | ------------------ | ------------------ |
| DevOps On-Call | (internal channel) | 15 min no response |
| DevOps Lead    | (internal channel) | 30 min no response |
| CTO            | (internal channel) | P1 incidents only  |

## Appendix

### Useful Commands Reference

```bash
# Service management
docker service ls
docker service ps <service>
docker service logs <service>
docker service update --force <service>

# Container debugging
docker exec -it <container> sh
docker inspect <container>

# Network debugging
docker network ls
docker network inspect <network>

# Volume management
docker volume ls
docker volume inspect <volume>

# System health
docker stats
docker system df
docker system info
```

### Configuration Files

| Config              | Location                               | Purpose           |
| ------------------- | -------------------------------------- | ----------------- |
| Prometheus          | /etc/prometheus/prometheus.yml         | Scrape config     |
| Loki                | /etc/loki/loki-config.yml              | Storage/retention |
| Grafana datasources | /etc/grafana/provisioning/datasources/ | Auto-provision    |
| Grafana dashboards  | /etc/grafana/provisioning/dashboards/  | Auto-provision    |

### Related Documentation

- [EasyPanel Setup Guide](../../infra/easypanel/README.md)
- [Prometheus Config](../../infra/easypanel/prometheus.yml)
- [Loki Config](../../infra/easypanel/loki-config.yml)
- [Grafana Provisioning](../../infra/easypanel/grafana/)
