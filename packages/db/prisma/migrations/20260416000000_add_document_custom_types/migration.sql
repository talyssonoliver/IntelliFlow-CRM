ALTER TABLE "case_documents"
ADD COLUMN "document_type_label" TEXT;

CREATE TABLE "document_type_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_type_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_type_definitions_tenantId_name_key"
ON "document_type_definitions"("tenantId", "name");

CREATE INDEX "document_type_definitions_tenantId_idx"
ON "document_type_definitions"("tenantId");

ALTER TABLE "document_type_definitions"
ADD CONSTRAINT "document_type_definitions_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
