# Disaster Recovery Restore Drill Report

**Document ID**: IFC-142-DRILL **Status**: No drill has been run yet.

A restore drill for IntelliFlow CRM has not been carried out. An earlier version
of this file described a drill on 2025-12-29 that did not happen, with teams and
systems this deployment does not have. It was removed on 2026-10-05 (IFC-142
reopened).

## What the deployment actually has

| System                      | Recovery source                                     |
| --------------------------- | --------------------------------------------------- |
| PostgreSQL (Supabase)       | Supabase-managed backups for the project            |
| Redis (Railway)             | None: cache and queues are treated as rebuildable   |
| Application config and code | Git (GitHub) and the Terraform in `infra/terraform` |
| Service secrets             | Railway / Vercel / GitHub secret stores             |

## What a real drill needs to record

1. Restore the latest Supabase backup into a scratch project (never production).
2. Point a local API build at it and run the smoke checks.
3. Record the start and end timestamps, the backup's timestamp (RPO), the time
   to a working API (RTO), and anything that failed.
4. Commit that log as this report's evidence, with the date it actually ran.
