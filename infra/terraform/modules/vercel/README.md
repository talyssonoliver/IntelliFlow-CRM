# Vercel Terraform Module

This module manages Vercel infrastructure for frontend deployments (Next.js
applications).

## Overview

Vercel is used for deploying Next.js frontend applications with automatic
deployments, edge functions, and global CDN.

## Features

- Next.js project configuration with framework presets
- Git repository integration (GitHub, GitLab, Bitbucket)
- Custom domain management with SSL
- Environment variable injection (production, preview, development)
- Edge Config for feature flags and dynamic configuration
- Deployment webhooks for notifications
- Monorepo support with root directory configuration

## Usage

### Basic Configuration

```hcl
module "vercel" {
  source = "./modules/vercel"

  project_name = "intelliflow-crm"
  environment  = "production"
  framework    = "nextjs"

  git_repository = {
    type = "github"
    repo = "intelliflow/intelliflow-crm"
  }

  domains = ["intelliflow-crm.com", "www.intelliflow-crm.com"]

  environment_variables = {
    NEXT_PUBLIC_SUPABASE_URL      = module.supabase.api_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY = module.supabase.anon_key
    SUPABASE_SERVICE_ROLE_KEY     = module.supabase.service_role_key
    DATABASE_URL                  = module.supabase.connection_string
  }
}
```

### Monorepo Configuration

For monorepos with multiple Next.js apps:

```hcl
module "vercel_web" {
  source = "./modules/vercel"

  project_name   = "intelliflow-crm-web"
  environment    = "production"
  root_directory = "apps/web"  # Root directory for build

  build_command    = "cd ../.. && pnpm run build --filter=web"
  install_command  = "pnpm install"
  output_directory = ".next"

  # ... other config
}
```

### Edge Config (Feature Flags)

```hcl
module "vercel" {
  source = "./modules/vercel"

  # ... basic config

  enable_edge_config = true
  edge_config_items = {
    "feature-ai-scoring" = {
      enabled = true
      rollout_percentage = 50
    }
    "feature-dark-mode" = {
      enabled = true
    }
  }
}
```

## Inputs

| Name                      | Description                              | Type                   | Default    | Required |
| ------------------------- | ---------------------------------------- | ---------------------- | ---------- | :------: |
| project_name              | Project name                             | `string`               | n/a        |   yes    |
| environment               | Environment (dev, staging, production)   | `string`               | n/a        |   yes    |
| framework                 | Framework preset (nextjs, gatsby, etc.)  | `string`               | `"nextjs"` |    no    |
| git_repository            | Git repository configuration             | `object({type, repo})` | `null`     |    no    |
| build_command             | Build command override                   | `string`               | `null`     |    no    |
| output_directory          | Output directory override                | `string`               | `null`     |    no    |
| install_command           | Install command override                 | `string`               | `null`     |    no    |
| root_directory            | Root directory for monorepo              | `string`               | `null`     |    no    |
| domains                   | Custom domains                           | `list(string)`         | `[]`       |    no    |
| apex_domain               | Apex domain for redirects                | `string`               | `""`       |    no    |
| redirect_www              | Redirect www to apex domain              | `bool`                 | `true`     |    no    |
| environment_variables     | Environment variables for all targets    | `map(string)`          | `{}`       |    no    |
| environment_specific_vars | Environment-specific variables           | `map(string)`          | `{}`       |    no    |
| region                    | Serverless function region               | `string`               | `"iad1"`   |    no    |
| enable_edge_config        | Enable Edge Config for feature flags     | `bool`                 | `false`    |    no    |
| edge_config_items         | Edge Config items                        | `map(any)`             | `{}`       |    no    |
| enable_deploy_hook        | Enable deployment webhook                | `bool`                 | `false`    |    no    |
| webhook_url               | Webhook URL for deployment notifications | `string`               | `""`       |    no    |
| tags                      | Resource tags                            | `map(string)`          | `{}`       |    no    |

## Outputs

| Name           | Description                 |
| -------------- | --------------------------- |
| project_id     | Vercel project ID           |
| url            | Vercel deployment URL       |
| deployment_id  | Latest deployment ID        |
| edge_config_id | Edge Config ID (if enabled) |

## Environment Variables

### Variable Targets

Vercel supports three deployment targets:

1. **Production**: Main branch deployments
2. **Preview**: Pull request and branch deployments
3. **Development**: Local development (`vercel dev`)

### Best Practices

**DO**:

- Use `NEXT_PUBLIC_*` prefix for client-side variables
- Keep server-side secrets in non-public variables
- Use environment-specific variables for different configs
- Mark sensitive variables as `sensitive = true` in Terraform

**DON'T**:

- Expose API keys in client-side variables
- Hardcode secrets in code
- Use same secrets across environments

### Example Configuration

```hcl
environment_variables = {
  # Client-side (public)
  NEXT_PUBLIC_SUPABASE_URL      = "https://xxx.supabase.co"
  NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbG..."

  # Server-side (private)
  SUPABASE_SERVICE_ROLE_KEY = "eyJhbG..."  # Sensitive!
  DATABASE_URL              = "postgresql://..."  # Sensitive!

  # Build-time
  NEXT_TELEMETRY_DISABLED = "1"
  NODE_ENV                = "production"
}

# Environment-specific
environment_specific_vars = {
  API_RATE_LIMIT = "1000"  # Production only
}
```

## Custom Domains

### Adding Domains

```hcl
domains = [
  "intelliflow-crm.com",          # Apex domain
  "www.intelliflow-crm.com"       # www subdomain
]

apex_domain  = "intelliflow-crm.com"
redirect_www = true  # Redirect www -> apex
```

### DNS Configuration

**For apex domain (intelliflow-crm.com)**:

```
Type: A
Name: @
Value: 76.76.21.21  # Vercel IP
```

**For www subdomain**:

```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### SSL Certificates

Vercel automatically provisions SSL certificates via Let's Encrypt. No
configuration required.

## Build Configuration

### Default Build Settings

Vercel auto-detects Next.js and uses:

```bash
# Install
pnpm install

# Build
pnpm run build

# Output
.next
```

### Custom Build Commands

For monorepos or custom setups:

```hcl
build_command    = "pnpm run build --filter=web"
install_command  = "pnpm install --frozen-lockfile"
output_directory = "apps/web/.next"
root_directory   = "apps/web"
```

## Serverless Function Regions

Configure the region for serverless functions:

```hcl
region = "iad1"  # Washington, D.C., USA (default)
```

**Available Regions**:

- `iad1` - Washington, D.C., USA (East)
- `sfo1` - San Francisco, USA (West)
- `lhr1` - London, United Kingdom
- `hnd1` - Tokyo, Japan
- `gru1` - São Paulo, Brazil

**Choose based on**:

- User location (minimize latency)
- Database region (reduce DB latency)
- Compliance requirements (data residency)

## Edge Config

Edge Config provides fast, globally distributed configuration for:

- Feature flags
- A/B test variants
- Redirects and rewrites
- Dynamic configuration

### Usage in Next.js

```typescript
import { get } from '@vercel/edge-config';

export async function middleware(request: Request) {
  const featureEnabled = await get('feature-ai-scoring');

  if (featureEnabled?.enabled) {
    // Feature is enabled
  }
}
```

### Updating Edge Config

```hcl
edge_config_items = {
  "feature-ai-scoring" = {
    enabled            = true
    rollout_percentage = 100  # Full rollout
  }
}
```

## Deployment Webhooks

Get notified of deployment events:

```hcl
enable_deploy_hook = true
webhook_url        = "https://api.intelliflow-crm.com/webhooks/vercel"
```

**Events**:

- `deployment.created` - New deployment started
- `deployment.succeeded` - Deployment successful
- `deployment.failed` - Deployment failed

**Payload Example**:

```json
{
  "type": "deployment.succeeded",
  "createdAt": 1703001234567,
  "payload": {
    "deployment": {
      "id": "dpl_xxx",
      "url": "intelliflow-crm-xxx.vercel.app",
      "meta": {
        "githubCommitRef": "main",
        "githubCommitSha": "abc123"
      }
    }
  }
}
```

## Performance Optimization

### Image Optimization

Vercel automatically optimizes images using Next.js Image component:

```typescript
import Image from 'next/image';

<Image
  src="/logo.png"
  width={200}
  height={100}
  alt="Logo"
/>
```

**Benefits**:

- Automatic WebP/AVIF conversion
- Lazy loading
- Responsive images
- CDN caching

### Edge Caching

Configure cache headers for static assets:

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};
```

## Cost Optimization

### Vercel Pricing (as of 2025)

- **Hobby**: Free (100GB bandwidth, 100 builds/day)
- **Pro**: $20/month per user (1TB bandwidth, 6000 build minutes)
- **Enterprise**: Custom pricing

### Optimization Tips

1. **Minimize bundle size**: Reduce JavaScript shipped to client
2. **Use ISR**: Incremental Static Regeneration for dynamic content
3. **Optimize images**: Use Next.js Image component
4. **Edge caching**: Cache static assets at edge
5. **Monitor bandwidth**: Track usage in Vercel dashboard

## Monitoring

Vercel provides built-in monitoring:

- **Analytics**: Core Web Vitals, page views
- **Logs**: Real-time deployment and function logs
- **Speed Insights**: Performance metrics
- **Error Tracking**: Automatic error detection

### Accessing Logs

```bash
# Vercel CLI
vercel logs <deployment-url>

# Or via dashboard
https://vercel.com/<team>/<project>/deployments
```

## Troubleshooting

### Build Failures

**Check build logs**:

```bash
vercel logs --scope=builds
```

**Common causes**:

1. Missing environment variables
2. TypeScript errors
3. Dependency installation failures
4. Build timeout (max 45 minutes)

### Environment Variable Issues

**Verify variables are set**:

```bash
vercel env ls
```

**Pull variables to local**:

```bash
vercel env pull .env.local
```

### Domain Not Working

**Check DNS propagation**:

```bash
dig intelliflow-crm.com
nslookup intelliflow-crm.com
```

**Verify domain in Vercel**:

```bash
vercel domains ls
```

## Examples

### Multi-Environment Setup

```hcl
# Production
module "vercel_production" {
  source = "./modules/vercel"

  project_name = "intelliflow-crm"
  environment  = "production"

  git_repository = {
    type = "github"
    repo = "intelliflow/intelliflow-crm"
  }

  domains = ["intelliflow-crm.com"]
}

# Staging
module "vercel_staging" {
  source = "./modules/vercel"

  project_name = "intelliflow-crm-staging"
  environment  = "staging"

  git_repository = {
    type = "github"
    repo = "intelliflow/intelliflow-crm"
  }

  domains = ["staging.intelliflow-crm.com"]
}
```

## Security

### Best Practices

1. **Use Vercel secrets** for sensitive environment variables
2. **Enable 2FA** on Vercel account
3. **Restrict API tokens** to specific scopes
4. **Use preview deployments** to test changes before production
5. **Implement security headers** (CSP, HSTS, etc.)

### Security Headers

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};
```

## CI/CD Integration

Vercel integrates automatically with Git providers:

1. **Push to branch** → Preview deployment
2. **Merge to main** → Production deployment
3. **Pull request** → Preview deployment with comment

### Custom Deployment Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel
        run: |
          cd infra/terraform
          terraform apply -auto-approve
        env:
          TF_VAR_vercel_api_token: ${{ secrets.VERCEL_API_TOKEN }}
```

## Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Terraform Provider](https://registry.terraform.io/providers/vercel/vercel/latest/docs)
- [Edge Config Documentation](https://vercel.com/docs/storage/edge-config)
- [Vercel CLI](https://vercel.com/docs/cli)
