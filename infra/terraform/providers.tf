# Terraform version and required providers
terraform {
  required_version = ">= 1.6.0"

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

    # HTTP provider for Supabase Management API
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }

    # Random provider for generating secrets
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }

    # Null provider for provisioners
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
