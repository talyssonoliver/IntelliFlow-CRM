# Terraform version and required providers
terraform {
  required_version = ">= 1.6.0"

  # Remote state + state locking + drift detection via HCP Terraform (free tier).
  # Replaces the previous S3 backend (no AWS account/creds needed). The org +
  # workspaces are created once in HCP; CI authenticates with TF_API_TOKEN and
  # selects the env workspace via TF_WORKSPACE (intelliflow-crm-{dev,staging,
  # production}). One-time setup: docs/operations/runbooks/terraform-hcp-backend.md
  cloud {
    organization = "Leangency"

    workspaces {
      tags = ["intelliflow-crm"]
    }
  }

  required_providers {
    # Vercel provider for frontend/API deployment
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }

    # Railway provider for backend services
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.3"
    }

    # Official Supabase provider — project lifecycle + settings + API keys
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.9"
    }

    # HTTP provider — kept for jwt_secret only (not exposed by supabase provider)
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }

    # Random provider for generating secrets
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }

    # Null provider for provisioners (storage buckets, pgvector — no provider resource yet)
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

# Vercel Provider Configuration
provider "vercel" {
  api_token = var.vercel_api_token
}

# Railway Provider Configuration
provider "railway" {
  token = var.railway_token
}

# Supabase Provider Configuration
# access_token authenticates against the Supabase Management API.
# Can also be supplied via SUPABASE_ACCESS_TOKEN environment variable.
provider "supabase" {
  access_token = var.supabase_access_token
}
