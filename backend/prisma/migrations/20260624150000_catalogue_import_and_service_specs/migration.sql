-- Service extended fields
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "scopeOfWork" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "deliverables" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "inclusions" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "exclusions" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "duration" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "slaResponseTime" TEXT;

-- Service specifications
CREATE TABLE IF NOT EXISTS "ServiceSpecification" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceSpecification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceSpecification_serviceId_name_key" ON "ServiceSpecification"("serviceId", "name");
CREATE INDEX IF NOT EXISTS "ServiceSpecification_serviceId_idx" ON "ServiceSpecification"("serviceId");

DO $$ BEGIN
  ALTER TABLE "ServiceSpecification" ADD CONSTRAINT "ServiceSpecification_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Product SKU unique per seller (nullable SKU allowed)
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sellerId_sku_key" ON "Product"("sellerId", "sku");

-- Catalogue import enums
DO $$ BEGIN
  CREATE TYPE "CatalogueImportType" AS ENUM ('PRODUCT', 'SERVICE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CatalogueImportStatus" AS ENUM ('PREVIEWED', 'CONFIRMED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Catalogue import batch
CREATE TABLE IF NOT EXISTS "CatalogueImportBatch" (
    "id" SERIAL NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "type" "CatalogueImportType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogueImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "previewData" JSONB,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogueImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CatalogueImportBatch_sellerId_idx" ON "CatalogueImportBatch"("sellerId");
CREATE INDEX IF NOT EXISTS "CatalogueImportBatch_sellerId_status_idx" ON "CatalogueImportBatch"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "CatalogueImportBatch_createdAt_idx" ON "CatalogueImportBatch"("createdAt");

DO $$ BEGIN
  ALTER TABLE "CatalogueImportBatch" ADD CONSTRAINT "CatalogueImportBatch_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Catalogue import errors
CREATE TABLE IF NOT EXISTS "CatalogueImportError" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogueImportError_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CatalogueImportError_batchId_idx" ON "CatalogueImportError"("batchId");
CREATE INDEX IF NOT EXISTS "CatalogueImportError_batchId_rowNumber_idx" ON "CatalogueImportError"("batchId", "rowNumber");

DO $$ BEGIN
  ALTER TABLE "CatalogueImportError" ADD CONSTRAINT "CatalogueImportError_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CatalogueImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
