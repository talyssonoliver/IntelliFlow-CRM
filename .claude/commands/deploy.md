# Deploy Command

Deploy IntelliFlow CRM to target environments.

## Usage
```
/deploy [environment] [--dry-run] [--skip-tests]
```

## Arguments
- `environment`: Target environment (dev, staging, production)
- `--dry-run`: Preview deployment without executing
- `--skip-tests`: Skip test execution (NOT recommended for production)

## Environments

### Development (dev)
- Auto-deploys on push to `develop` branch
- Uses development Supabase instance
- Minimal resource allocation

### Staging (staging)
- Deploys on push to `staging` branch
- Production-like configuration
- Used for UAT and QA testing

### Production (production)
- Manual trigger required
- Full security gates
- Blue/green deployment
- Automatic rollback on failure

## Deployment Pipeline

1. **Pre-flight checks**
   - Run all tests
   - Security scan
   - Coverage validation
   - Lighthouse audit

2. **Build**
   - Build all packages
   - Generate Prisma client
   - Bundle applications

3. **Deploy**
   - Push to container registry
   - Update Kubernetes manifests
   - Apply database migrations
   - Health check verification

4. **Post-deploy**
   - Smoke tests
   - Performance baseline
   - Alert configuration

## Example
```bash
# Preview production deployment
/deploy production --dry-run

# Deploy to staging
/deploy staging

# Emergency dev deployment (use sparingly)
/deploy dev --skip-tests
```

## Rollback
```bash
# Automatic rollback happens on failure
# Manual rollback:
/deploy production --rollback
```
