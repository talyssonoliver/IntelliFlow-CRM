# Provider requirements for the supabase module.
# The supabase provider is declared here for version pinning close to the
# consumer. Root providers.tf also declares it for the provider block.
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.9"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}
