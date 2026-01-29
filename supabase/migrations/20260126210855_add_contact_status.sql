-- Add status field to contacts table
-- Follows DRY pattern: CONTACT_STATUSES defined in domain layer

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

-- Add check constraint to enforce valid status values
ALTER TABLE contacts
ADD CONSTRAINT contacts_status_check
CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'));

-- Add index for filtering by status
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);

COMMENT ON COLUMN contacts.status IS 'Contact status: ACTIVE, INACTIVE, or ARCHIVED';
