-- Phase 2: Cart System (Cart + CartItem)
-- Idempotent migration with IF NOT EXISTS guards

-- Create CartStatus enum
DO $$ BEGIN
  CREATE TYPE "CartStatus" AS ENUM (
    'ACTIVE',
    'SUBMITTED_FOR_APPROVAL',
    'APPROVED',
    'REJECTED',
    'CONVERTED_TO_ORDER',
    'ABANDONED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create Cart table
CREATE TABLE IF NOT EXISTS "Cart" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "createdById"    INTEGER NOT NULL,
  "status"         "CartStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes"          TEXT,
  "approvedById"   INTEGER,
  "approvedAt"     TIMESTAMP(3),
  "rejectedById"   INTEGER,
  "rejectedAt"     TIMESTAMP(3),
  "rejectionNote"  TEXT,
  "convertedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cart_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Cart_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "Cart_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "Cart_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Cart_organizationId_status_idx" ON "Cart"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Cart_createdById_idx" ON "Cart"("createdById");
CREATE INDEX IF NOT EXISTS "Cart_approvedById_idx" ON "Cart"("approvedById");
CREATE INDEX IF NOT EXISTS "Cart_rejectedById_idx" ON "Cart"("rejectedById");

-- Create CartItem table
CREATE TABLE IF NOT EXISTS "CartItem" (
  "id"                    SERIAL PRIMARY KEY,
  "cartId"                INTEGER NOT NULL,
  "productId"             INTEGER,
  "serviceId"             INTEGER,
  "sellerId"              INTEGER NOT NULL,
  "itemName"              TEXT NOT NULL,
  "quantity"              DECIMAL(18, 3) NOT NULL,
  "unitOfMeasure"         TEXT NOT NULL,
  "unitPrice"             DECIMAL(18, 2) NOT NULL,
  "currency"              TEXT NOT NULL DEFAULT 'INR',
  "technicalApproved"     BOOLEAN,
  "technicalApprovedById" INTEGER,
  "technicalNote"         TEXT,
  "technicalDecidedAt"    TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE,
  CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL,
  CONSTRAINT "CartItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL,
  CONSTRAINT "CartItem_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "CartItem_technicalApprovedById_fkey" FOREIGN KEY ("technicalApprovedById") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "CartItem_cartId_idx" ON "CartItem"("cartId");
CREATE INDEX IF NOT EXISTS "CartItem_productId_idx" ON "CartItem"("productId");
CREATE INDEX IF NOT EXISTS "CartItem_serviceId_idx" ON "CartItem"("serviceId");
CREATE INDEX IF NOT EXISTS "CartItem_sellerId_idx" ON "CartItem"("sellerId");
CREATE INDEX IF NOT EXISTS "CartItem_technicalApprovedById_idx" ON "CartItem"("technicalApprovedById");
