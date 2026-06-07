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

# Only the UNCONDITIONALLY boot-required secrets are gated here. Two audit-Tier-0
# vars are CONDITIONAL and intentionally NOT gated, because the live deployment
# does not use those code paths:
#   - litellm_master_key / litellm_base_url: only thrown when AI_PROVIDER=litellm.
#     The live ai-worker runs AI_PROVIDER=openrouter (OPENROUTER_API_KEY + Gemini),
#     so LiteLLM is unused. Set these only if you migrate the AI path to LiteLLM.
#   - vault_token / vault_local_dek_secret: only required when VAULT_ENABLED=true.
#     The live services use the EnvironmentKeyProvider (VAULT_ENABLED unset), which
#     derives field keys from PRISMA_FIELD_ENCRYPTION_KEY directly. Set these only
#     if you turn on the Vault Transit provider (see ADR-065 / issue #317).
check "tier0_secrets_present" {
  assert {
    condition = var.environment != "production" || alltrue([
      var.prisma_field_encryption_key != "",
      var.ai_audit_signing_key != "",
      var.redis_host != "",
      var.redis_password != "",
      var.sentry_dsn != "",
    ])
    error_message = join(" ", [
      "Tier-0 secret(s) empty for production (issue #315): one or more of",
      "PRISMA_FIELD_ENCRYPTION_KEY, AI_AUDIT_SIGNING_KEY, REDIS_HOST,",
      "REDIS_PASSWORD, SENTRY_DSN is unset. Set them as sensitive HCP workspace",
      "variables before applying — see",
      "docs/operations/credential-coverage-remediation-2026-06-07.md.",
    ])
  }
}
