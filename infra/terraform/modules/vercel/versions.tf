# Provider requirements for the vercel module.
# Must declare every non-default-namespace provider this module uses,
# otherwise `terraform init` at the root resolves them as
# `hashicorp/vercel` (which doesn't exist on the registry) and the
# init step fails with: "provider registry registry.terraform.io
# does not have a provider named registry.terraform.io/hashicorp/vercel".
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
  }
}
