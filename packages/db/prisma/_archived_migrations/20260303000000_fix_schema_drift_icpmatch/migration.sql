-- Fix schema drift: missing icpMatch column, enum values, and index
-- These were defined in schema.prisma but not yet applied to the database.

-- Add missing enum values
ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'ENDED';
ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'DELETED';
ALTER TYPE "ToolCallStatus" ADD VALUE IF NOT EXISTS 'TIMEOUT';
ALTER TYPE "ToolCallStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- Add missing column on lead_ai_insights
ALTER TABLE "lead_ai_insights" ADD COLUMN IF NOT EXISTS "icpMatch" TEXT;

-- Add missing index
CREATE INDEX IF NOT EXISTS "opportunities_contactId_stage_idx" ON "opportunities"("contactId", "stage");
