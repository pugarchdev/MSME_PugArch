DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BuyerRequirementType') THEN
    CREATE TYPE "BuyerRequirementType" AS ENUM ('PRODUCT', 'SERVICE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequirementVisibility') THEN
    CREATE TYPE "RequirementVisibility" AS ENUM ('PUBLIC', 'VERIFIED_SELLERS_ONLY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BuyerRequirementStatus') THEN
    CREATE TYPE "BuyerRequirementStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'OPEN', 'CLOSED', 'CANCELLED', 'AWARDED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequirementResponseStatus') THEN
    CREATE TYPE "RequirementResponseStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CartItemType') THEN
    CREATE TYPE "CartItemType" AS ENUM ('PRODUCT', 'SERVICE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BuyerRequirement" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER,
  "buyerOrganizationId" INTEGER,
  "title" TEXT NOT NULL,
  "requirementType" "BuyerRequirementType" NOT NULL,
  "categoryId" INTEGER,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(18,3),
  "unit" TEXT,
  "location" TEXT,
  "budgetMin" DECIMAL(18,2),
  "budgetMax" DECIMAL(18,2),
  "lastDate" TIMESTAMP(3) NOT NULL,
  "visibility" "RequirementVisibility" NOT NULL DEFAULT 'PUBLIC',
  "status" "BuyerRequirementStatus" NOT NULL DEFAULT 'DRAFT',
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "isUrgent" BOOLEAN NOT NULL DEFAULT false,
  "requiredDocuments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "contactPerson" TEXT,
  "attachmentUrl" TEXT,
  "terms" TEXT,
  "approvedById" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RequirementResponse" (
  "id" SERIAL PRIMARY KEY,
  "requirementId" INTEGER NOT NULL,
  "sellerOrganizationId" INTEGER,
  "sellerUserId" INTEGER NOT NULL,
  "offeredPrice" DECIMAL(18,2),
  "offeredQuantity" DECIMAL(18,3),
  "deliveryTimeline" TEXT,
  "message" TEXT NOT NULL,
  "attachmentUrl" TEXT,
  "terms" TEXT,
  "status" "RequirementResponseStatus" NOT NULL DEFAULT 'SUBMITTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "GuestCart" (
  "id" SERIAL PRIMARY KEY,
  "cartToken" TEXT NOT NULL UNIQUE,
  "companyId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "GuestCartItem" (
  "id" SERIAL PRIMARY KEY,
  "guestCartId" INTEGER NOT NULL,
  "itemType" "CartItemType" NOT NULL,
  "productId" INTEGER,
  "serviceId" INTEGER,
  "quantity" DECIMAL(18,3) NOT NULL,
  "priceSnapshot" DECIMAL(18,2),
  "sellerOrganizationId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OrganizationProfile" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL UNIQUE,
  "organizationType" "OrganizationType",
  "industryType" TEXT,
  "logoUrl" TEXT,
  "description" TEXT,
  "isLargeIndustry" BOOLEAN NOT NULL DEFAULT false,
  "isBigMsme" BOOLEAN NOT NULL DEFAULT false,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BuyerRequirement_companyId_fkey') THEN
    ALTER TABLE "BuyerRequirement" ADD CONSTRAINT "BuyerRequirement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BuyerRequirement_buyerOrganizationId_fkey') THEN
    ALTER TABLE "BuyerRequirement" ADD CONSTRAINT "BuyerRequirement_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BuyerRequirement_categoryId_fkey') THEN
    ALTER TABLE "BuyerRequirement" ADD CONSTRAINT "BuyerRequirement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BuyerRequirement_createdById_fkey') THEN
    ALTER TABLE "BuyerRequirement" ADD CONSTRAINT "BuyerRequirement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BuyerRequirement_approvedById_fkey') THEN
    ALTER TABLE "BuyerRequirement" ADD CONSTRAINT "BuyerRequirement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RequirementResponse_requirementId_fkey') THEN
    ALTER TABLE "RequirementResponse" ADD CONSTRAINT "RequirementResponse_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "BuyerRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RequirementResponse_sellerOrganizationId_fkey') THEN
    ALTER TABLE "RequirementResponse" ADD CONSTRAINT "RequirementResponse_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RequirementResponse_sellerUserId_fkey') THEN
    ALTER TABLE "RequirementResponse" ADD CONSTRAINT "RequirementResponse_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuestCart_companyId_fkey') THEN
    ALTER TABLE "GuestCart" ADD CONSTRAINT "GuestCart_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuestCartItem_guestCartId_fkey') THEN
    ALTER TABLE "GuestCartItem" ADD CONSTRAINT "GuestCartItem_guestCartId_fkey" FOREIGN KEY ("guestCartId") REFERENCES "GuestCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuestCartItem_productId_fkey') THEN
    ALTER TABLE "GuestCartItem" ADD CONSTRAINT "GuestCartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuestCartItem_serviceId_fkey') THEN
    ALTER TABLE "GuestCartItem" ADD CONSTRAINT "GuestCartItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GuestCartItem_sellerOrganizationId_fkey') THEN
    ALTER TABLE "GuestCartItem" ADD CONSTRAINT "GuestCartItem_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationProfile_organizationId_fkey') THEN
    ALTER TABLE "OrganizationProfile" ADD CONSTRAINT "OrganizationProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BuyerRequirement_companyId_idx" ON "BuyerRequirement"("companyId");
CREATE INDEX IF NOT EXISTS "BuyerRequirement_buyerOrganizationId_idx" ON "BuyerRequirement"("buyerOrganizationId");
CREATE INDEX IF NOT EXISTS "BuyerRequirement_categoryId_idx" ON "BuyerRequirement"("categoryId");
CREATE INDEX IF NOT EXISTS "BuyerRequirement_status_lastDate_idx" ON "BuyerRequirement"("status", "lastDate");
CREATE INDEX IF NOT EXISTS "BuyerRequirement_isFeatured_idx" ON "BuyerRequirement"("isFeatured");
CREATE INDEX IF NOT EXISTS "BuyerRequirement_isUrgent_idx" ON "BuyerRequirement"("isUrgent");
CREATE INDEX IF NOT EXISTS "BuyerRequirement_createdById_idx" ON "BuyerRequirement"("createdById");
CREATE INDEX IF NOT EXISTS "BuyerRequirement_approvedById_idx" ON "BuyerRequirement"("approvedById");
CREATE INDEX IF NOT EXISTS "RequirementResponse_requirementId_idx" ON "RequirementResponse"("requirementId");
CREATE INDEX IF NOT EXISTS "RequirementResponse_sellerOrganizationId_idx" ON "RequirementResponse"("sellerOrganizationId");
CREATE INDEX IF NOT EXISTS "RequirementResponse_sellerUserId_idx" ON "RequirementResponse"("sellerUserId");
CREATE INDEX IF NOT EXISTS "RequirementResponse_status_idx" ON "RequirementResponse"("status");
CREATE INDEX IF NOT EXISTS "GuestCart_companyId_idx" ON "GuestCart"("companyId");
CREATE INDEX IF NOT EXISTS "GuestCart_updatedAt_idx" ON "GuestCart"("updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "GuestCartItem_guestCartId_itemType_productId_serviceId_key" ON "GuestCartItem"("guestCartId", "itemType", "productId", "serviceId");
CREATE INDEX IF NOT EXISTS "GuestCartItem_guestCartId_idx" ON "GuestCartItem"("guestCartId");
CREATE INDEX IF NOT EXISTS "GuestCartItem_productId_idx" ON "GuestCartItem"("productId");
CREATE INDEX IF NOT EXISTS "GuestCartItem_serviceId_idx" ON "GuestCartItem"("serviceId");
CREATE INDEX IF NOT EXISTS "GuestCartItem_sellerOrganizationId_idx" ON "GuestCartItem"("sellerOrganizationId");
CREATE INDEX IF NOT EXISTS "OrganizationProfile_isLargeIndustry_idx" ON "OrganizationProfile"("isLargeIndustry");
CREATE INDEX IF NOT EXISTS "OrganizationProfile_isBigMsme_idx" ON "OrganizationProfile"("isBigMsme");
CREATE INDEX IF NOT EXISTS "OrganizationProfile_isFeatured_idx" ON "OrganizationProfile"("isFeatured");
CREATE INDEX IF NOT EXISTS "OrganizationProfile_verificationStatus_idx" ON "OrganizationProfile"("verificationStatus");
