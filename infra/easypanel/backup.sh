#!/bin/bash
# IntelliFlow CRM - EasyPanel Volume Backup Script
#
# Run via cron on EasyPanel server:
# 0 3 * * 0 /root/backup.sh >> /var/log/easypanel-backup.log 2>&1
#
# Backs up all monitoring service volumes weekly

set -euo pipefail

# Configuration
BACKUP_DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/${BACKUP_DATE}"
RETENTION_DAYS=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_success() {
    log "${GREEN}SUCCESS${NC}: $1"
}

log_error() {
    log "${RED}ERROR${NC}: $1"
}

log_warn() {
    log "${YELLOW}WARN${NC}: $1"
}

# Create backup directory
log "Creating backup directory: ${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"

# Backup Prometheus data
log "Backing up Prometheus data..."
if docker volume ls | grep -q prometheus-data; then
    docker run --rm \
        -v prometheus-data:/data:ro \
        -v "${BACKUP_DIR}":/backup \
        alpine tar czf /backup/prometheus-${BACKUP_DATE}.tar.gz -C /data .
    log_success "Prometheus backup completed: prometheus-${BACKUP_DATE}.tar.gz"
else
    log_warn "Prometheus volume not found, skipping"
fi

# Backup Grafana data
log "Backing up Grafana data..."
if docker volume ls | grep -q grafana-data; then
    docker run --rm \
        -v grafana-data:/data:ro \
        -v "${BACKUP_DIR}":/backup \
        alpine tar czf /backup/grafana-${BACKUP_DATE}.tar.gz -C /data .
    log_success "Grafana backup completed: grafana-${BACKUP_DATE}.tar.gz"
else
    log_warn "Grafana volume not found, skipping"
fi

# Backup Loki data
log "Backing up Loki data..."
if docker volume ls | grep -q loki-data; then
    docker run --rm \
        -v loki-data:/data:ro \
        -v "${BACKUP_DIR}":/backup \
        alpine tar czf /backup/loki-${BACKUP_DATE}.tar.gz -C /data .
    log_success "Loki backup completed: loki-${BACKUP_DATE}.tar.gz"
else
    log_warn "Loki volume not found, skipping"
fi

# Backup SonarQube data (if exists)
log "Backing up SonarQube data..."
if docker volume ls | grep -q sonar-data; then
    docker run --rm \
        -v sonar-data:/data:ro \
        -v "${BACKUP_DIR}":/backup \
        alpine tar czf /backup/sonarqube-${BACKUP_DATE}.tar.gz -C /data .
    log_success "SonarQube backup completed: sonarqube-${BACKUP_DATE}.tar.gz"
else
    log_warn "SonarQube volume not found, skipping"
fi

# Calculate backup sizes
log "Backup sizes:"
du -sh "${BACKUP_DIR}"/* 2>/dev/null || log_warn "No backups created"

# Generate checksums for audit
log "Generating checksums..."
cd "${BACKUP_DIR}"
sha256sum *.tar.gz > checksums.sha256 2>/dev/null || log_warn "No files to checksum"
log_success "Checksums saved to checksums.sha256"

# Clean up old backups
log "Cleaning up backups older than ${RETENTION_DAYS} days..."
find /backups -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} + 2>/dev/null || true
log_success "Cleanup completed"

# Optional: Upload to S3
# Uncomment and configure if using S3-compatible storage
# log "Uploading to S3..."
# if command -v aws &> /dev/null; then
#     aws s3 sync "${BACKUP_DIR}" s3://intelliflow-backups/easypanel/${BACKUP_DATE}/
#     log_success "S3 upload completed"
# else
#     log_warn "AWS CLI not installed, skipping S3 upload"
# fi

# Summary
log "=========================================="
log "Backup completed at $(date)"
log "Location: ${BACKUP_DIR}"
log "=========================================="
