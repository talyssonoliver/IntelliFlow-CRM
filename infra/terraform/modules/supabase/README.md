# Supabase Terraform Module

This module manages Supabase infrastructure.

## Limitations

Supabase does not have an official Terraform provider. This module provides:

1. **Documentation** for manual setup
2. **Import patterns** for existing projects
3. **Provisioners** for automated configuration via CLI/API

## Usage

### Option 1: Manual Setup + Import

1. Create project at https://app.supabase.com/new
2. Note the project reference ID
3. Import into Terraform:

```bash
terraform import module.supabase.null_resource.supabase_project <project-ref>
```

### Option 2: CLI Automation

Use Supabase CLI in provisioners:

```hcl
module "supabase" {
  source = "./modules/supabase"

  project_name   = "intelliflow-crm"
  environment    = "dev"
  access_token   = var.supabase_access_token
  db_password    = var.db_password

  enable_pgvector = true

  storage_buckets = {
    "documents" = {
      public = false
      file_size_limit = "50MiB"
      allowed_mime_types = ["application/pdf"]
    }
  }
}
```

## Required Setup

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Get access token:
   - Visit https://app.supabase.com/account/tokens
   - Create new token
   - Set as `TF_VAR_supabase_access_token`

3. Configure project reference:
   ```bash
   export TF_VAR_supabase_project_ref="your-project-ref"
   ```

## Features

- pgvector extension for embeddings
- Storage bucket management
- Authentication configuration
- Realtime subscriptions
