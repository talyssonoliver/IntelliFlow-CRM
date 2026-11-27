-- MVP-003: undo a lead-to-deal conversion - which contact the conversion created.
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only. One nullable
-- column on "opportunities"; no row is read or changed, no constraint, index or RLS change.
-- "createdContactId" is the id of the contact a lead-to-deal conversion created, written in the
-- conversion's own transaction. Undo deletes a contact only when it equals this id; null (an
-- existing contact was linked, none was created, or the deal predates this column) keeps it.
--
-- Recovery plan: forward-only; an unset column changes nothing (undo then keeps the contact). A
-- down-migration (DROP COLUMN) is Class C - human-only, never autonomous. Production applies only
-- through the gated `prisma migrate deploy` workflow, after the owner's yes.

ALTER TABLE "opportunities" ADD COLUMN "createdContactId" TEXT;