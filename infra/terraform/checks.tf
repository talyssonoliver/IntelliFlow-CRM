# Production pre-apply guards (issue #315).
#
# A "" value for a Tier-0 secret crash-boots the consuming service exactly like
# an absent one (e.g. PRISMA_FIELD_ENCRYPTION_KEY hard-throws at module load), so
# surface it at PLAN time rather than discovering it when a worker crash-loops.
# The Tier-0 variables default to "" so dev/staging plans and `terraform validate`
# stay green; this check fires ONLY for environment == "production".
#
# A failed `check` assertion is reported as a warning in the plan — the human
# plan review (per the Pre-apply checklist in
# docs/operations/credential-coverage-remediation-2026-06-07.md) MUST treat it as
# a hard gate and not dispatch the apply until it is green.

check "tier0_secrets_present" {
  assert {
    condition = var.environment != "production" || alltrue([
      var.prisma_field_encryption_key != "",
      var.ai_audit_signing_key != "",
      var.litellm_master_key != "",
      var.redis_host != "",
      var.redis_password != "",
      var.vault_local_dek_secret != "" || var.vault_token != "",
      var.sentry_dsn != "",
    ])
    error_message = join(" ", [
      "Tier-0 secret(s) empty for production (issue #315):",
      "one or more of PRISMA_FIELD_ENCRYPTION_KEY, AI_AUDIT_SIGNING_KEY,",
      "LITELLM_MASTER_KEY, REDIS_HOST, REDIS_PASSWORD,",
      "VAULT_LOCAL_DEK_SECRET/VAULT_TOKEN, SENTRY_DSN is unset.",
      "Set them as sensitive HCP workspace variables before applying — see",
      "docs/operations/credential-coverage-remediation-2026-06-07.md.",
    ])
  }
}
