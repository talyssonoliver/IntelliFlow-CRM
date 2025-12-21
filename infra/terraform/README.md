# IntelliFlow CRM - Infrastructure as Code

This directory contains Terraform configurations for managing IntelliFlow CRM infrastructure across multiple environments and cloud providers.

## Overview

The Terraform configuration provisions and manages:
- **Supabase**: PostgreSQL database with pgvector, authentication, and real-time subscriptions
- **Vercel**: Frontend and API deployments with edge functions
- **Railway**: Backend services and worker applications
- **Environment Variables**: Centralized secrets management across all platforms

## Architecture

```
infra/terraform/
├── main.tf                 # Root module configuration
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── providers.tf            # Provider configurations
├── terraform.tfvars.example # Example variable values
├── backend.tf              # Remote state configuration
├── modules/
│   ├── supabase/          # Supabase project module
│   ├── vercel/            # Vercel deployment module
│   └── railway/           # Railway services module
└── environments/
    ├── dev/               # Development environment
    ├── staging/           # Staging environment
    └── production/        # Production environment
```

## Prerequisites

1. **Install Terraform** (>= 1.6.0)
   ```bash
   # Windows (Chocolatey)
   choco install terraform

   # MacOS (Homebrew)
   brew install terraform

   # Verify installation
   terraform version
   ```

2. **Install Required Providers**
   - Supabase CLI (for local development)
   - Vercel CLI
   - Railway CLI (optional)

3. **API Tokens**
   - Supabase: Personal Access Token from https://app.supabase.com/account/tokens
   - Vercel: Token from https://vercel.com/account/tokens
   - Railway: Token from https://railway.app/account/tokens

## Quick Start

### 1. Configure Backend (Remote State)

Create a `backend.tf` file (not committed to git):

```hcl
terraform {
  backend "s3" {
    # Use Terraform Cloud or S3-compatible storage
    bucket = "intelliflow-terraform-state"
    key    = "crm/terraform.tfstate"
    region = "us-east-1"

    # For Terraform Cloud:
    # organization = "intelliflow"
    # workspaces {
    #   name = "crm-production"
    # }
  }
}
```

### 2. Set Environment Variables

Create a `.env` file in this directory (gitignored):

```bash
# Supabase
export TF_VAR_supabase_access_token="sbp_xxxxxxxxxxxxx"

# Vercel
export TF_VAR_vercel_api_token="xxxxxxxxxxxxx"

# Railway
export TF_VAR_railway_token="xxxxxxxxxxxxx"

# Database
export TF_VAR_db_password="super-secret-password"
```

Load the variables:
```bash
source .env
```

### 3. Initialize Terraform

```bash
cd infra/terraform
terraform init
```

### 4. Plan Infrastructure Changes

```bash
# Review changes before applying
terraform plan -out=plan.tfplan

# Review specific environment
terraform plan -var-file="environments/dev/terraform.tfvars"
```

### 5. Apply Changes

```bash
# Apply the plan
terraform apply plan.tfplan

# Or apply directly
terraform apply -auto-approve
```

### 6. View Outputs

```bash
terraform output
terraform output -json > outputs.json
```

## Environment Management

### Working with Multiple Environments

Use Terraform workspaces or separate state files:

```bash
# Using workspaces
terraform workspace new dev
terraform workspace new staging
terraform workspace new production

# Switch between workspaces
terraform workspace select dev
terraform apply -var-file="environments/dev/terraform.tfvars"

# Using separate state files (recommended)
terraform init -backend-config="key=crm/dev/terraform.tfstate"
terraform apply -var-file="environments/dev/terraform.tfvars"
```

### Environment-Specific Variables

Each environment directory contains:
- `terraform.tfvars`: Variable values
- `override.tf`: Environment-specific overrides (optional)

Example `environments/dev/terraform.tfvars`:
```hcl
environment = "dev"
project_name = "intelliflow-crm-dev"
region = "us-east-1"

# Supabase
supabase_project_name = "intelliflow-dev"
supabase_region = "us-east-1"
supabase_db_password = "env:DB_PASSWORD_DEV"

# Vercel
vercel_project_name = "intelliflow-crm-dev"
vercel_framework = "nextjs"

# Railway
railway_project_name = "intelliflow-dev"
railway_environment = "dev"
```

## Modules

### Supabase Module

**Note**: Supabase does not have an official Terraform provider. This module uses the Supabase Management API through the `restapi` provider or documents manual import procedures.

**Features**:
- Project creation and configuration
- Database setup with pgvector extension
- Authentication configuration
- Storage bucket setup
- Edge function deployment

**Limitations**:
- Manual project creation may be required
- Use `terraform import` for existing projects

```hcl
module "supabase" {
  source = "./modules/supabase"

  project_name = var.supabase_project_name
  region       = var.supabase_region
  db_password  = var.supabase_db_password

  # pgvector extension
  enable_pgvector = true

  # Authentication
  auth_site_url = "https://intelliflow-crm.com"
  jwt_expiry    = 3600

  # Storage
  storage_buckets = {
    "documents" = {
      public = false
      file_size_limit = "50MB"
    }
    "images" = {
      public = true
      file_size_limit = "10MB"
    }
  }
}
```

### Vercel Module

**Features**:
- Project creation and configuration
- Domain management
- Environment variables
- Build configuration
- Edge config

```hcl
module "vercel" {
  source = "./modules/vercel"

  project_name = var.vercel_project_name
  framework    = "nextjs"

  # Git integration
  git_repository = {
    type = "github"
    repo = "intelliflow/intelliflow-crm"
  }

  # Domains
  domains = ["intelliflow-crm.com", "www.intelliflow-crm.com"]

  # Environment variables
  environment_variables = {
    DATABASE_URL = module.supabase.connection_string
    NEXT_PUBLIC_SUPABASE_URL = module.supabase.api_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY = module.supabase.anon_key
  }
}
```

### Railway Module

**Features**:
- Project and service creation
- Environment variables management
- Service scaling configuration
- Custom domain setup

```hcl
module "railway" {
  source = "./modules/railway"

  project_name = var.railway_project_name
  environment  = var.environment

  services = {
    "api" = {
      image = "ghcr.io/intelliflow/api:latest"
      replicas = 2
      memory = "512Mi"
      cpu = "0.5"
    }
    "ai-worker" = {
      image = "ghcr.io/intelliflow/ai-worker:latest"
      replicas = 1
      memory = "1Gi"
      cpu = "1"
    }
  }

  # Shared environment variables
  environment_variables = {
    DATABASE_URL = module.supabase.connection_string
    REDIS_URL = var.redis_url
  }
}
```

## State Management

### Remote State

Terraform state files contain sensitive information and should NEVER be committed to git.

**Options**:
1. **Terraform Cloud** (Recommended)
2. **AWS S3** + DynamoDB for locking
3. **Azure Blob Storage**
4. **Google Cloud Storage**

### State Locking

Enable state locking to prevent concurrent modifications:

```hcl
terraform {
  backend "s3" {
    bucket         = "intelliflow-terraform-state"
    key            = "crm/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}
```

## Drift Detection

Drift detection identifies configuration changes made outside of Terraform.

### Manual Drift Detection

```bash
# Check for drift
terraform plan -detailed-exitcode

# Exit codes:
# 0 = No changes
# 1 = Error
# 2 = Changes detected (drift)
```

### Automated Drift Detection

Configure in CI/CD (see `.github/workflows/terraform-drift.yml`):

```yaml
name: Terraform Drift Detection

on:
  schedule:
    - cron: '0 8 * * *'  # Daily at 8 AM UTC
  workflow_dispatch:

jobs:
  detect-drift:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Terraform Plan
        run: |
          terraform init
          terraform plan -detailed-exitcode
        continue-on-error: true
        id: plan

      - name: Alert on Drift
        if: steps.plan.outputs.exitcode == '2'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '🚨 Terraform Drift Detected',
              body: 'Infrastructure drift detected. Please review and reconcile.'
            })
```

## Security Best Practices

1. **Never commit secrets**: Use environment variables or secret managers
2. **Enable state encryption**: Encrypt state files at rest
3. **Use least-privilege IAM**: Grant minimal required permissions
4. **Enable MFA**: Require MFA for production changes
5. **Review plans**: Always review `terraform plan` before applying
6. **Use version constraints**: Pin provider versions

## Testing Infrastructure

### Destroy and Rebuild Test

Verify 100% reproducibility by destroying and recreating infrastructure:

```bash
# WARNING: This will destroy all resources!
# Only run in non-production environments

# Step 1: Destroy
terraform destroy -auto-approve | tee artifacts/logs/destroy-rebuild-test.log

# Step 2: Rebuild
terraform apply -auto-approve | tee -a artifacts/logs/destroy-rebuild-test.log

# Step 3: Verify
terraform plan -detailed-exitcode
```

### Automated Testing

Use Terratest or similar for automated infrastructure testing:

```go
// tests/terraform_test.go
package test

import (
    "testing"
    "github.com/gruntwork-io/terratest/modules/terraform"
)

func TestInfrastructure(t *testing.T) {
    terraformOptions := &terraform.Options{
        TerraformDir: "../infra/terraform",
        Vars: map[string]interface{}{
            "environment": "test",
        },
    }

    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    // Verify outputs
    dbUrl := terraform.Output(t, terraformOptions, "database_url")
    assert.NotEmpty(t, dbUrl)
}
```

## Troubleshooting

### Common Issues

1. **State Lock Error**
   ```bash
   # Force unlock (use with caution)
   terraform force-unlock <lock-id>
   ```

2. **Provider Authentication**
   ```bash
   # Verify credentials
   vercel whoami
   railway whoami
   ```

3. **Resource Already Exists**
   ```bash
   # Import existing resource
   terraform import module.supabase.supabase_project.main <project-id>
   ```

4. **Plan Shows Unexpected Changes**
   ```bash
   # Refresh state
   terraform refresh
   terraform plan
   ```

## Migration Guide

### Importing Existing Infrastructure

If you have existing Supabase/Vercel/Railway resources:

1. **Identify Resources**
   ```bash
   # List Supabase projects
   supabase projects list

   # List Vercel projects
   vercel projects list

   # List Railway projects
   railway list
   ```

2. **Generate Import Statements**
   ```bash
   # Example: Import Supabase project
   terraform import module.supabase.supabase_project.main <project-ref>

   # Example: Import Vercel project
   terraform import module.vercel.vercel_project.main <project-id>
   ```

3. **Verify State**
   ```bash
   terraform state list
   terraform state show module.supabase.supabase_project.main
   ```

## CI/CD Integration

Terraform is integrated into CI/CD pipelines:

- **PR Comments**: Automatically comment plan output on PRs
- **Auto-Apply**: Apply changes on merge to main (production requires approval)
- **Drift Detection**: Daily scheduled drift checks
- **Cost Estimation**: Estimate infrastructure costs before applying

See `.github/workflows/terraform.yml` for implementation.

## Cost Optimization

### Current Tier Usage

- **Supabase**: Free tier (500MB database, 1GB storage, 50,000 monthly active users)
- **Vercel**: Hobby tier (100GB bandwidth/month)
- **Railway**: Starter tier ($5/month per service)

### Upgrade Triggers

Configure alerts when approaching tier limits:

```hcl
# In modules/supabase/monitoring.tf
resource "grafana_alert" "db_storage" {
  name = "Supabase Storage Near Limit"

  condition = "supabase_storage_bytes > 450MB"

  notifications = ["slack"]
}
```

## Additional Resources

- [Terraform Documentation](https://www.terraform.io/docs)
- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [Vercel Terraform Provider](https://registry.terraform.io/providers/vercel/vercel/latest/docs)
- [Railway CLI Documentation](https://docs.railway.app/reference/cli)
- [Terraform Best Practices](https://www.terraform-best-practices.com/)

## Support

For infrastructure issues:
1. Check this README
2. Review Terraform plan output
3. Check drift detection alerts
4. Consult team infrastructure channel
