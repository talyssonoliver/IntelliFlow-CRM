# Terraform Modules

This directory contains reusable Terraform modules for IntelliFlow CRM
infrastructure.

## Module Architecture

Each module follows a consistent structure:

```
modules/<module-name>/
├── main.tf           # Primary resource definitions
├── variables.tf      # Input variables with descriptions
├── outputs.tf        # Output values for other modules
├── README.md         # Module-specific documentation
└── versions.tf       # Provider version constraints (optional)
```

## Available Modules

### 1. Supabase Module (`modules/supabase/`)

**Purpose**: Manages Supabase PostgreSQL database infrastructure

**Features**:

- Project creation and configuration (via Management API)
- pgvector extension for AI embeddings
- Storage bucket management
- Authentication configuration
- Realtime subscriptions

**Limitations**:

- Supabase does not have an official Terraform provider
- Uses HTTP provider for Management API calls
- Some resources may require manual setup and import

**Usage**:

```hcl
module "supabase" {
  source = "./modules/supabase"

  project_name   = "intelliflow-crm"
  environment    = "production"
  region         = "us-east-1"
  access_token   = var.supabase_access_token
  db_password    = var.db_password

  enable_pgvector = true
  enable_realtime = true

  storage_buckets = {
    "documents" = {
      public = false
      file_size_limit = "50MiB"
    }
  }
}
```

**Outputs**:

- `api_url` - Supabase API endpoint
- `anon_key` - Anonymous access key for client-side
- `service_role_key` - Service role key for server-side
- `connection_string` - Database connection URL

**See**: `modules/supabase/README.md` for detailed documentation

---

### 2. Vercel Module (`modules/vercel/`)

**Purpose**: Manages Vercel frontend and API deployments

**Features**:

- Next.js project configuration
- Custom domain management
- Environment variable injection
- Git repository integration
- Build and deployment settings

**Usage**:

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

  domains = ["intelliflow-crm.com"]

  environment_variables = {
    NEXT_PUBLIC_SUPABASE_URL = module.supabase.api_url
    DATABASE_URL = module.supabase.connection_string
  }
}
```

**Outputs**:

- `url` - Vercel deployment URL
- `project_id` - Vercel project ID
- `deployment_id` - Latest deployment ID

---

### 3. Railway Module (`modules/railway/`)

**Purpose**: Manages Railway backend services (API, AI Worker)

**Features**:

- Multi-service deployment
- Container orchestration
- Environment variable management
- Service scaling configuration
- Custom domain setup

**Usage**:

```hcl
module "railway" {
  source = "./modules/railway"

  project_name = "intelliflow-crm"
  environment  = "production"

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

  shared_env_vars = {
    DATABASE_URL = module.supabase.connection_string
    REDIS_URL = var.redis_url
  }
}
```

**Outputs**:

- `api_url` - Railway API service URL
- `worker_url` - Railway worker service URL
- `project_id` - Railway project ID

---

## Module Development Guidelines

### 1. Module Structure

**Required Files**:

- `main.tf` - Resource definitions
- `variables.tf` - Input variables
- `outputs.tf` - Output values
- `README.md` - Module documentation

**Optional Files**:

- `versions.tf` - Provider version constraints
- `data.tf` - Data source definitions
- `locals.tf` - Local values
- `*.tfvars` - Example variable values

### 2. Variable Naming

Use consistent naming conventions:

```hcl
# Good
variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "enable_feature" {
  description = "Enable specific feature"
  type        = bool
  default     = false
}

# Bad
variable "name" { ... }  # Too generic
variable "feat" { ... }   # Unclear abbreviation
```

### 3. Output Naming

Outputs should be descriptive:

```hcl
# Good
output "api_url" {
  description = "API endpoint URL"
  value       = "https://api.example.com"
}

# Bad
output "url" { ... }  # Too generic
```

### 4. Documentation

Each module README must include:

1. **Purpose**: What the module does
2. **Features**: Key capabilities
3. **Limitations**: Known constraints
4. **Usage**: Example code block
5. **Inputs**: Variable documentation
6. **Outputs**: Output documentation
7. **Examples**: Real-world usage scenarios

### 5. Versioning

Modules should be versioned when stable:

```hcl
module "supabase" {
  source  = "git::https://github.com/intelliflow/terraform-modules.git//supabase?ref=v1.2.0"

  # ... configuration
}
```

For local development, use relative paths:

```hcl
module "supabase" {
  source = "./modules/supabase"

  # ... configuration
}
```

## Testing Modules

### Unit Testing

Test modules in isolation using Terratest:

```go
package test

import (
    "testing"
    "github.com/gruntwork-io/terratest/modules/terraform"
)

func TestSupabaseModule(t *testing.T) {
    terraformOptions := &terraform.Options{
        TerraformDir: "../modules/supabase",
        Vars: map[string]interface{}{
            "project_name": "test-project",
            "environment": "test",
        },
    }

    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    // Verify outputs
    apiUrl := terraform.Output(t, terraformOptions, "api_url")
    assert.NotEmpty(t, apiUrl)
}
```

### Integration Testing

Test modules together in realistic scenarios:

```bash
# Navigate to test environment
cd infra/terraform/environments/test

# Initialize and apply
terraform init
terraform apply -auto-approve

# Run validation tests
terraform plan -detailed-exitcode

# Cleanup
terraform destroy -auto-approve
```

## Security Best Practices

### 1. Sensitive Outputs

Mark sensitive outputs appropriately:

```hcl
output "service_role_key" {
  description = "Supabase service role key (sensitive)"
  value       = local.service_role_key
  sensitive   = true
}
```

### 2. Variable Validation

Add validation rules to variables:

```hcl
variable "environment" {
  description = "Environment name"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_password) >= 16
    error_message = "Database password must be at least 16 characters."
  }
}
```

### 3. Least Privilege

Modules should request minimal permissions:

```hcl
# Bad - overly broad permissions
data "aws_iam_policy_document" "admin" {
  statement {
    actions   = ["*"]
    resources = ["*"]
  }
}

# Good - specific permissions
data "aws_iam_policy_document" "read_only" {
  statement {
    actions = [
      "s3:GetObject",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.main.arn,
      "${aws_s3_bucket.main.arn}/*"
    ]
  }
}
```

## Drift Detection

Modules support automated drift detection:

```bash
# Check for drift in specific module
terraform plan -target=module.supabase -detailed-exitcode

# Exit codes:
# 0 = No drift detected
# 1 = Error occurred
# 2 = Drift detected
```

See parent `README.md` for CI/CD drift detection automation.

## Common Patterns

### 1. Conditional Resource Creation

```hcl
# Create resource only in production
resource "example_resource" "conditional" {
  count = var.environment == "production" ? 1 : 0

  # ... configuration
}
```

### 2. Dynamic Blocks

```hcl
# Dynamically create storage buckets
resource "storage_bucket" "buckets" {
  for_each = var.storage_buckets

  name   = each.key
  public = each.value.public

  dynamic "lifecycle_rule" {
    for_each = each.value.lifecycle_rules != null ? [1] : []

    content {
      action {
        type = lifecycle_rule.value.action
      }
      condition {
        age = lifecycle_rule.value.days
      }
    }
  }
}
```

### 3. Module Composition

Modules can call other modules:

```hcl
module "database" {
  source = "../database"

  # ... configuration
}

module "application" {
  source = "../application"

  database_url = module.database.connection_string
}
```

## Troubleshooting

### Module Not Found

```bash
# Error: Module not found
terraform init

# Solution: Ensure module path is correct
# Relative: ./modules/supabase
# Git: git::https://...
```

### Circular Dependencies

```bash
# Error: Cycle detected in module dependencies

# Solution: Review module dependencies
terraform graph | dot -Tpng > graph.png
```

### State Lock Issues

```bash
# Error: State locked by another process

# Solution: Force unlock (use with caution)
terraform force-unlock <lock-id>
```

## Contributing

When adding new modules:

1. Follow the module structure guidelines
2. Include comprehensive README
3. Add example usage in parent `main.tf`
4. Document all inputs and outputs
5. Include validation rules
6. Test in isolation before integration
7. Update this README with module entry

## Resources

- [Terraform Module Documentation](https://www.terraform.io/docs/language/modules/develop/index.html)
- [Terraform Module Registry](https://registry.terraform.io/)
- [Terratest Documentation](https://terratest.gruntwork.io/)
- [Terraform Best Practices](https://www.terraform-best-practices.com/code-structure)
