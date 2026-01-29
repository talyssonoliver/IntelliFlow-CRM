# Supabase Infrastructure Module
#
# Note: Supabase does not have an official Terraform provider yet.
# This module provides documentation and patterns for managing Supabase resources.
#
# Options:
# 1. Use Supabase Management API via HTTP provider
# 2. Use Supabase CLI in provisioners
# 3. Manually create project and import with `terraform import`

locals {
  project_name_full = "${var.project_name}-${var.environment}"
}

# Placeholder for Supabase project
# In practice, you would:
# 1. Manually create the project at https://app.supabase.com
# 2. Import it: terraform import supabase_project.main <project-ref>
#
# OR use the Management API (requires custom provider or HTTP calls)

resource "null_resource" "supabase_project" {
  triggers = {
    project_name = local.project_name_full
    region       = var.region
  }

  # Provisioner to create project via CLI (if needed)
  provisioner "local-exec" {
    when    = create
    command = <<-EOT
      echo "Supabase project management:"
      echo "1. Create project manually at https://app.supabase.com/new/${var.region}"
      echo "2. Name: ${local.project_name_full}"
      echo "3. Region: ${var.region}"
      echo "4. Plan: ${var.plan}"
      echo ""
      echo "Then import with:"
      echo "terraform import module.supabase.null_resource.supabase_project <project-ref>"
    EOT
  }
}

# Database configuration via SQL
resource "null_resource" "database_setup" {
  depends_on = [null_resource.supabase_project]

  triggers = {
    enable_pgvector = var.enable_pgvector
  }

  # Enable pgvector extension
  provisioner "local-exec" {
    when = create
    command = var.enable_pgvector ? "echo 'Run: CREATE EXTENSION IF NOT EXISTS vector;' | psql ${var.db_connection_string}" : "echo 'pgvector not enabled'"
  }
}

# Storage buckets configuration
resource "null_resource" "storage_buckets" {
  depends_on = [null_resource.supabase_project]

  for_each = var.storage_buckets

  triggers = {
    bucket_name = each.key
    public      = each.value.public
  }

  # Create storage bucket via Supabase CLI
  provisioner "local-exec" {
    when = create
    command = <<-EOT
      supabase storage create ${each.key} \
        --public=${each.value.public} \
        --file-size-limit=${each.value.file_size_limit} \
        --project-ref=${var.project_ref}
    EOT
  }
}

# Auth configuration
resource "null_resource" "auth_config" {
  depends_on = [null_resource.supabase_project]

  triggers = {
    site_url    = var.auth_site_url
    jwt_expiry  = var.auth_jwt_expiry
  }

  # Update auth settings via Management API
  provisioner "local-exec" {
    when = create
    command = <<-EOT
      curl -X PATCH "https://api.supabase.com/v1/projects/${var.project_ref}/config/auth" \
        -H "Authorization: Bearer ${var.access_token}" \
        -H "Content-Type: application/json" \
        -d '{
          "SITE_URL": "${var.auth_site_url}",
          "JWT_EXPIRY": ${var.auth_jwt_expiry}
        }'
    EOT
  }
}

# Data Sources (to retrieve existing project info)
data "http" "project_info" {
  count = var.project_ref != "" ? 1 : 0

  url = "https://api.supabase.com/v1/projects/${var.project_ref}"

  request_headers = {
    Authorization = "Bearer ${var.access_token}"
  }
}

# Local values for outputs
locals {
  # Parse project info from API response
  project_data = var.project_ref != "" ? jsondecode(data.http.project_info[0].response_body) : {}

  # Construct URLs
  api_url = var.project_ref != "" ? "https://${var.project_ref}.supabase.co" : ""
  db_url  = var.project_ref != "" ? "postgresql://postgres:${var.db_password}@db.${var.project_ref}.supabase.co:5432/postgres" : ""
}
