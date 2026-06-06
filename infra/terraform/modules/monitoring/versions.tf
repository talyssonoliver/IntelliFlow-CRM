# Provider requirements for the monitoring module.
# Only the hashicorp/local provider is used (the module renders a tracked
# observability manifest). It declares no cloud provider, so it never needs
# credentials and is always safe to `plan`.
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.4"
    }
  }
}
