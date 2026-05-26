-- Phase 4: Goods Receipt Note (GRN)

DO $$ BEGIN
  CREATE TYPE "GrnStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'PARTIAL'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "GoodsReceiptNote" (
  "id"              SERIAL PRIMARY KEY,
  "grnNumber"       TEXT NOT NULL,
  "purchaseOrderId" INTEGER NOT NULL,
  "receivedById"    INTEGER NOT NULL,
  "organizationId"  INTEGER NOT NULL,
  "status"          "GrnStatus" NOT NULL DEFAULT 'DRAFT',
  "receivedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remarks"         TEXT,
  "inspectionNote"  TEXT,
  "approvedById"    INTEGER,
  "approvedAt"      TIMESTAMP(3),
  "rejectedById"    INTEGER,
  "rejectedAt"      TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoodsReceiptNote_grnNumber_key" UNIQUE ("grnNumber"),
  CONSTRAINT "GoodsReceiptNote_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE,
  CONSTRAINT "GoodsReceiptNote_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "GoodsReceiptNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "GoodsReceiptNote_purchaseOrderId_idx" ON "GoodsReceiptNote"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "GoodsReceiptNote_organizationId_status_idx" ON "GoodsReceiptNote"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "GoodsReceiptNote_receivedById_idx" ON "GoodsReceiptNote"("receivedById");

CREATE TABLE IF NOT EXISTS "GrnItem" (
  "id"                  SERIAL PRIMARY KEY,
  "grnId"               INTEGER NOT NULL,
  "purchaseOrderItemId" INTEGER,
  "itemName"            TEXT NOT NULL,
  "orderedQty"          DECIMAL(18, 3) NOT NULL,
  "receivedQty"         DECIMAL(18, 3) NOT NULL,
  "acceptedQty"         DECIMAL(18, 3) NOT NULL,
  "rejectedQty"         DECIMAL(18, 3) NOT NULL,
  "rejectionReason"     TEXT,
  "unitOfMeasure"       TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrnItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceiptNote"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "GrnItem_grnId_idx" ON "GrnItem"("grnId");

CREATE TABLE IF NOT EXISTS "GrnDocument" (
  "id"           SERIAL PRIMARY KEY,
  "grnId"        INTEGER NOT NULL,
  "fileAssetId"  INTEGER NOT NULL,
  "documentType" TEXT NOT NULL,
  "uploadedById" INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrnDocument_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceiptNote"("id") ON DELETE CASCADE,
  CONSTRAINT "GrnDocument_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id"),
  CONSTRAINT "GrnDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "GrnDocument_grnId_idx" ON "GrnDocument"("grnId");
CREATE INDEX IF NOT EXISTS "GrnDocument_fileAssetId_idx" ON "GrnDocument"("fileAssetId");
CREATE INDEX IF NOT EXISTS "GrnDocument_uploadedById_idx" ON "GrnDocument"("uploadedById");
