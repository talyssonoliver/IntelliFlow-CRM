# Release Checklist

> **Task**: IFC-130 - Release governance: staging auto-deploy, promotion policy, quality/security gates, rollback criteria
> **Status**: Completed
> **Sprint**: 5

## Pre-Release Checklist

### Code Quality

- [ ] All PR reviews completed and approved
- [ ] No pending merge conflicts
- [ ] Branch is up-to-date with `main`
- [ ] All TODO/FIXME comments addressed or tracked

### Testing

- [ ] Unit tests pass (coverage ≥90%)
- [ ] Integration tests pass (100%)
- [ ] E2E tests pass (100%)
- [ ] Manual smoke tests completed in staging
- [ ] Performance benchmarks within acceptable range
- [ ] Load testing completed (if applicable)

### Security

- [ ] Security scan clean (0 critical, 0 high)
- [ ] Dependencies updated and scanned
- [ ] No secrets in codebase
- [ ] Auth flows tested
- [ ] OWASP checklist reviewed

### Database

- [ ] Migrations tested in staging
- [ ] Down migrations available and tested
- [ ] Data backup completed
- [ ] Performance impact assessed

### Documentation

- [ ] Release notes prepared
- [ ] CHANGELOG updated
- [ ] API documentation updated (if applicable)
- [ ] User-facing docs updated (if applicable)

### Monitoring

- [ ] Alerts configured for new features
- [ ] Dashboards updated
- [ ] Log levels appropriate
- [ ] Error tracking configured

## Release Execution

### Pre-Deployment (T-30 minutes)

- [ ] Notify stakeholders of upcoming release
- [ ] Verify on-call availability
- [ ] Check external dependencies status
- [ ] Confirm rollback plan

### Deployment (T-0)

- [ ] Initiate deployment via GitHub Actions
- [ ] Monitor deployment progress
- [ ] Verify health checks pass
- [ ] Confirm traffic routing correct

### Post-Deployment (T+5 minutes)

- [ ] Verify key user flows working
- [ ] Check error rates in monitoring
- [ ] Verify database connectivity
- [ ] Confirm external integrations working

### Validation (T+30 minutes)

- [ ] Run smoke test suite
- [ ] Check performance metrics
- [ ] Verify logging and tracing
- [ ] Confirm no increase in error rates

## Post-Release Checklist

### Immediate (within 1 hour)

- [ ] Update status page (if applicable)
- [ ] Send release notification
- [ ] Close related tickets/issues
- [ ] Tag release in Git

### Follow-up (within 24 hours)

- [ ] Monitor for any delayed issues
- [ ] Review release metrics
- [ ] Document any lessons learned
- [ ] Update runbooks if needed

## Rollback Procedure

### Automatic Rollback

If any of these conditions are met, automatic rollback triggers:
- Health check failures (3 consecutive)
- Error rate >1% for 5 minutes
- Response latency p99 >500ms for 5 minutes

### Manual Rollback Steps

1. **Identify Issue**
   ```bash
   # Check recent deployments
   gh run list --workflow=cd.yml

   # Check error logs
   kubectl logs -l app=api --since=10m
   ```

2. **Initiate Rollback**
   ```bash
   # Via GitHub Actions
   gh workflow run rollback.yml -f version=<previous-version>

   # Or via kubectl
   kubectl rollout undo deployment/api
   ```

3. **Verify Rollback**
   ```bash
   # Check deployment status
   kubectl rollout status deployment/api

   # Verify application health
   curl https://api.intelliflow.com/health
   ```

4. **Communicate**
   - Update status page
   - Notify stakeholders
   - Create incident ticket

## Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-Call Engineer | PagerDuty | Automatic |
| Tech Lead | @tech-lead | Within 15 min |
| DevOps Lead | @devops-lead | Within 15 min |
| CTO | @cto | For P0 incidents |

## Related Documents

- [Promotion Policy](../../release/promotion-policy.md)
- [Incident Response](./incident-response.md)
- [Quality Gates](../quality-gates.md)
