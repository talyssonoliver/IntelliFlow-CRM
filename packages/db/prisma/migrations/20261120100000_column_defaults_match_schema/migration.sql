-- MVP-007 (customer-issue register #35): two column defaults the migrations do not give, which
-- production and schema.prisma already have.
--
-- A read-only diff of PRODUCTION against schema.prisma (20/11/2026) did not list these two, while a
-- database built from the migrations did (prisma migrate diff). So production already holds the
-- state below (reached outside the migration history, e.g. by a db push long ago) and this migration
-- only makes a fresh database equal it:
--   * users.locale: schema.prisma says DEFAULT 'en-US'; 20260412031212_add_user_profile_fields
--     created it with DEFAULT 'en-GB', and no migration changed it.
--   * document_type_definitions.updatedAt: schema.prisma says @updatedAt, with no database default
--     (Prisma sets the value on every write; nothing writes this table by raw SQL);
--     20260416000000_add_document_custom_types created it with DEFAULT CURRENT_TIMESTAMP.
--
-- Class B for the production step (autonomy policy, ADR-069): not additive, because it drops a default,
-- so it is flagged for a go/no-go before `prisma migrate deploy` reaches production. Catalog only: no
-- row is read, rewritten or deleted, and no table is rewritten. Both statements are idempotent, so on a
-- database that already has this state they change nothing. Before production, confirm that read-only:
--   SELECT column_default FROM information_schema.columns
--   WHERE (table_name, column_name) IN (('users','locale'),('document_type_definitions','updatedAt'));
-- expected: 'en-US'::text and NULL.
--
-- Recovery plan: forward-only and reversible by hand: ALTER COLUMN "locale" SET DEFAULT 'en-GB' and
-- ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP restore the old defaults (a hand-run change
-- outside a migration is Class C: ask first). Production applies only through the gated
-- `prisma migrate deploy` workflow.

SET lock_timeout = '5s';

ALTER TABLE "users" ALTER COLUMN "locale" SET DEFAULT 'en-US';

ALTER TABLE "document_type_definitions" ALTER COLUMN "updatedAt" DROP DEFAULT;

RESET lock_timeout;
