-- IFC-227: Add account_id FK to leads table
ALTER TABLE "leads" ADD COLUMN "account_id" TEXT;

ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "leads_account_id_idx" ON "leads"("account_id");
