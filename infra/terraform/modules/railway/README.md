# Railway Terraform Module

This module manages Railway infrastructure for backend services (API, AI
Worker).

## Overview

Railway is used to host containerized backend services with automatic
deployments, scaling, and environment management.

## Features

- Multi-service deployment (API, AI Worker, etc.)
- Container orchestration with custom resource allocation
- Environment variable management (shared and service-specific)
- Automatic deployments triggered by configuration changes
- Custom domain support
- Service scaling configuration

## Usage

### Basic Configuration

```hcl
module "railway" {
  source = "./modules/railway"

  project_name = "intelliflow-crm"
  environment  = "production"

  services = {
    "api" = {
      image    = "ghcr.io/intelliflow/api:latest"
      replicas = 2
      memory   = "512Mi"
      cpu      = "0.5"
      env_vars = {
        PORT = "3000"
      }
    }
    "ai-worker" = {
      image    = "ghcr.io/intelliflow/ai-worker:latest"
      replicas = 1
      memory   = "1Gi"
      cpu      = "1"
      env_vars = {
        WORKER_QUEUE = "ai-tasks"
      }
    }
  }

  shared_env_vars = {
    DATABASE_URL              = module.supabase.connection_string
    SUPABASE_URL              = module.supabase.api_url
    SUPABASE_SERVICE_ROLE_KEY = module.supabase.service_role_key
    NODE_ENV                  = "production"
  }

  api_domain = "api.intelliflow-crm.com"
}
```

### Environment-Specific Configuration

**Development**:

```hcl
services = {
  "api" = {
    image    = "ghcr.io/intelliflow/api:dev"
    replicas = 1
    memory   = "256Mi"
    cpu      = "0.25"
    env_vars = {
      LOG_LEVEL = "debug"
    }
  }
}
```

**Production**:

```hcl
services = {
  "api" = {
    image    = "ghcr.io/intelliflow/api:latest"
    replicas = 3
    memory   = "1Gi"
    cpu      = "1"
    env_vars = {
      LOG_LEVEL = "info"
    }
  }
}
```

## Inputs

| Name            | Description                                   | Type          | Default | Required |
| --------------- | --------------------------------------------- | ------------- | ------- | :------: |
| project_name    | Project name                                  | `string`      | n/a     |   yes    |
| environment     | Environment (dev, staging, production)        | `string`      | n/a     |   yes    |
| services        | Service configurations                        | `map(object)` | n/a     |   yes    |
| shared_env_vars | Shared environment variables for all services | `map(string)` | `{}`    |    no    |
| api_domain      | Custom domain for API service                 | `string`      | `""`    |    no    |
| tags            | Resource tags                                 | `map(string)` | `{}`    |    no    |

### Service Configuration Object

```hcl
{
  image    = string  # Docker image (e.g., "ghcr.io/org/image:tag")
  replicas = number  # Number of replicas (1-10)
  memory   = string  # Memory allocation (e.g., "512Mi", "1Gi")
  cpu      = string  # CPU allocation (e.g., "0.5", "1")
  env_vars = map(string)  # Service-specific environment variables
}
```

## Outputs

| Name           | Description                |
| -------------- | -------------------------- |
| project_id     | Railway project ID         |
| api_url        | Railway API service URL    |
| worker_url     | Railway worker service URL |
| environment_id | Railway environment ID     |

## Resource Allocation Guidelines

### Memory

- **256Mi**: Development/testing services
- **512Mi**: Small API services (< 100 req/min)
- **1Gi**: Standard API services (100-1000 req/min)
- **2Gi**: AI Worker, heavy processing

### CPU

- **0.25**: Development/testing
- **0.5**: Small API services
- **1**: Standard services
- **2**: High-performance requirements

## Environment Variables

### Variable Priority

1. **Service-specific** (highest priority)
2. **Shared environment variables**
3. **Railway defaults** (lowest priority)

### Best Practices

**DO**:

- Use `shared_env_vars` for common configuration (DATABASE_URL, API keys)
- Use `env_vars` for service-specific settings (PORT, QUEUE_NAME)
- Mark sensitive variables as `sensitive = true`
- Use Railway's built-in secrets for passwords

**DON'T**:

- Hardcode secrets in Terraform code
- Store credentials in git
- Use same secrets across environments

## Custom Domains

Configure custom domains for public-facing services:

```hcl
api_domain = "api.intelliflow-crm.com"
```

**DNS Configuration**:

1. Add CNAME record pointing to Railway domain
2. Wait for SSL certificate provisioning (automatic)
3. Verify domain in Railway dashboard

## Deployment Triggers

Deployments are automatically triggered when:

- Docker image tag changes
- Replica count changes
- Environment variables change
- Service configuration changes

## Scaling

### Horizontal Scaling

```hcl
services = {
  "api" = {
    replicas = 3  # Scale to 3 instances
    # ... other config
  }
}
```

### Vertical Scaling

```hcl
services = {
  "api" = {
    memory = "2Gi"  # Increase memory
    cpu    = "2"    # Increase CPU
    # ... other config
  }
}
```

## Monitoring

Railway provides built-in monitoring:

- **Metrics**: CPU, memory, network usage
- **Logs**: Real-time log streaming
- **Deployments**: Build and deployment history
- **Health Checks**: Automatic service health monitoring

Access via Railway dashboard or CLI:

```bash
railway logs --service api
railway metrics --service ai-worker
```

## Cost Optimization

### Railway Pricing (as of 2025)

- **Free Tier**: $5 of compute credits/month
- **Hobby**: $5/month for additional usage
- **Pro**: $20/month + usage

### Optimization Tips

1. **Right-size resources**: Start small, scale up as needed
2. **Use replicas wisely**: Only scale when traffic demands
3. **Optimize Docker images**: Smaller images = faster deployments
4. **Implement caching**: Reduce compute requirements

## Troubleshooting

### Deployment Failures

```bash
# View deployment logs
railway logs --service api --deployment <deployment-id>

# Check service status
railway status
```

### Service Not Starting

**Common causes**:

1. Invalid environment variables
2. Port mismatch (Railway uses `PORT` env var)
3. Health check failures
4. Resource limits exceeded

**Solution**:

```hcl
services = {
  "api" = {
    env_vars = {
      PORT = "3000"  # Ensure PORT is set
    }
  }
}
```

### Out of Memory Errors

**Increase memory allocation**:

```hcl
memory = "1Gi"  # Increase from 512Mi
```

## Examples

### Multi-Region Deployment

```hcl
# US Region
module "railway_us" {
  source = "./modules/railway"

  project_name = "intelliflow-crm-us"
  # ... config
}

# EU Region
module "railway_eu" {
  source = "./modules/railway"

  project_name = "intelliflow-crm-eu"
  # ... config
}
```

### Canary Deployment

```hcl
# Stable version
services = {
  "api-stable" = {
    image    = "ghcr.io/intelliflow/api:v1.0.0"
    replicas = 2
    # ... config
  }
  "api-canary" = {
    image    = "ghcr.io/intelliflow/api:v1.1.0"
    replicas = 1  # 33% traffic to canary
    # ... config
  }
}
```

## Security

### Best Practices

1. **Use Railway secrets** for sensitive values
2. **Enable 2FA** on Railway account
3. **Restrict API tokens** to specific projects
4. **Use private Docker registries** (GitHub Container Registry)
5. **Implement health checks** to detect compromised services

### Environment Variable Encryption

Railway encrypts all environment variables at rest and in transit.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Update Terraform
        run: |
          cd infra/terraform
          terraform init
          terraform apply -auto-approve
        env:
          TF_VAR_railway_token: ${{ secrets.RAILWAY_TOKEN }}
```

## Resources

- [Railway Documentation](https://docs.railway.app/)
- [Railway CLI](https://docs.railway.app/develop/cli)
- [Railway Terraform Provider](https://registry.terraform.io/providers/terraform-community-providers/railway/latest/docs)
- [Railway Pricing](https://railway.app/pricing)
