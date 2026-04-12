-- ============================================
-- CONTACT EXTENDED FIELDS MIGRATION (IFC-089)
-- Adds extended contact fields for form support
--
-- Fields added:
--   - streetAddress: Contact's street address
--   - city: Contact's city
--   - zipCode: Contact's postal/zip code
--   - company: Company name (may differ from linked account)
--   - linkedInUrl: LinkedIn profile URL
--   - contactType: customer, prospect, partner, vendor, investor, other
--   - tags: Array of string tags
--   - contactNotes: Free-form notes
-- ============================================

BEGIN;

-- Add extended contact fields to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "streetAddress" TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "zipCode" TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "company" TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "linkedInUrl" TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "contactType" TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "contactNotes" TEXT;

-- Add index on contactType for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON contacts("contactType");

-- Add index on city for filtering/searching
CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts("city");

COMMIT;
