-- #1218: record whether a lead's AI score is real.
-- Every existing lead starts as NONE: until now a failed or inconclusive scoring was stored as a
-- real 0, so no stored 0 can be trusted as a score. The next successful scoring sets SCORED.

CREATE TYPE "LeadScoringStatus" AS ENUM ('NONE', 'SCORED', 'NEEDS_REVIEW', 'FAILED');

ALTER TABLE "leads"
  ADD COLUMN "scoringStatus" "LeadScoringStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "scoredAt" TIMESTAMP(3);
