-- Repair schema drift left by earlier hand-written migrations.
-- These additions are idempotent so existing dev data is preserved.

ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "aadhaarNumber" TEXT;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "aadhaarVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "declarationAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "officeZoneName" TEXT;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "otherMethodDetails" TEXT;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "termsAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BuyerProfile" ALTER COLUMN "industry" DROP NOT NULL;
ALTER TABLE "BuyerProfile" ALTER COLUMN "pan" DROP NOT NULL;
ALTER TABLE "BuyerProfile" ALTER COLUMN "representativeName" DROP NOT NULL;
ALTER TABLE "BuyerProfile" ALTER COLUMN "state" DROP NOT NULL;
ALTER TABLE "BuyerProfile" ALTER COLUMN "city" DROP NOT NULL;
ALTER TABLE "BuyerProfile" ALTER COLUMN "pincode" DROP NOT NULL;
ALTER TABLE "BuyerProfile" ALTER COLUMN "registeredAddress" DROP NOT NULL;

ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "aadhaarVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "catalogType" TEXT;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "dateAsInPan" TIMESTAMP(3);
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "detailsUpdated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "dob" TIMESTAMP(3);
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "eInvoicingExcluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "isStartup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "isUdyamCertified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "nameAsInPan" TEXT;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "optForSahay" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "organizationType" TEXT;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "ownershipDeclarationAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "ownershipVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "panVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "participateInBid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "roleInOrg" TEXT;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "termsAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "turnoverMax3Yrs" TEXT;
ALTER TABLE "SellerProfile" ALTER COLUMN "businessName" DROP NOT NULL;
ALTER TABLE "SellerProfile" ALTER COLUMN "mobile" DROP NOT NULL;

ALTER TABLE "Tender" ADD COLUMN IF NOT EXISTS "documentUrl" TEXT;

CREATE TABLE IF NOT EXISTS "Approval" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'approved',
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" INTEGER,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Approval_userId_fkey') THEN
    ALTER TABLE "Approval"
    ADD CONSTRAINT "Approval_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_userId_fkey') THEN
    ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
