-- IFC-242: BANT qualification fields as first-class Lead columns.
-- budget/authority/need are free-text; timeline/annualRevenue are Zod-constrained
-- bands. All nullable + additive; annualRevenue is distinct from estimatedValue
-- (deal value, Int cents).
-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "annualRevenue" TEXT,
ADD COLUMN     "authority" TEXT,
ADD COLUMN     "budget" TEXT,
ADD COLUMN     "need" TEXT,
ADD COLUMN     "timeline" TEXT;
