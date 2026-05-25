# Provider requirements for the railway module.
# Must declare every non-default-namespace provider this module uses,
# otherwise `terraform init` at the root resolves them as
# `hashicorp/railway` (which doesn't exist on the registry).
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.3"
    }
  }
}
