# Provider requirements for the supabase module.
# All providers used here (http, null) are in the default hashicorp/
# namespace and would resolve correctly without explicit declarations,
# but declaring them keeps version pins close to the consumer and
# avoids surprises when root provider blocks change.
terraform {
  required_version = ">= 1.6.0"

  required_providers {
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
