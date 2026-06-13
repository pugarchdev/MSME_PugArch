-- Reverse auction, compare, offline payment proof, and dynamic banner foundation.

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'NEFT';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'RTGS';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'IMPS';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CHEQUE';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TYPE "AuctionStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "AuctionStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "AuctionStatus" ADD VALUE IF NOT EXISTS 'AWARD_RECOMMENDED';
ALTER TYPE "AuctionStatus" ADD VALUE IF NOT EXISTS 'AWARDED';

ALTER TYPE "ParticipantStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "ParticipantStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "ParticipantStatus" ADD VALUE IF NOT EXISTS 'TECHNICALLY_QUALIFIED';
ALTER TYPE "ParticipantStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PORTAL_PAYMENT_INITIATED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PORTAL_PAYMENT_SUCCESS';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PORTAL_PAYMENT_FAILED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'OFFLINE_PROOF_UPLOADED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'OFFLINE_PROOF_UNDER_REVIEW';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'OFFLINE_PROOF_VERIFIED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'OFFLINE_PROOF_REJECTED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'SETTLEMENT_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'SETTLED';

DO $$ BEGIN
  CREATE TYPE "AuctionVisibilityMode" AS ENUM ('INVITED_SELLERS_ONLY', 'TECHNICALLY_QUALIFIED_ONLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "OfflinePaymentProofStatus" AS ENUM ('UPLOADED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "BannerType" AS ENUM ('DEFAULT_ADMIN', 'TOP_BUYER_PROMOTION', 'TOP_SELLER_PROMOTION', 'ANNOUNCEMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "BannerStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'HIDDEN', 'REJECTED', 'EXPIRED', 'DELETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "BannerDisplayLocation" AS ENUM ('HOME_HERO', 'MARKETPLACE_HOME', 'DASHBOARD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "OrganizationRankType" AS ENUM ('BUYER', 'SELLER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "BannerEligibilityType" AS ENUM ('TOP_BUYER', 'TOP_SELLER', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Auction" ALTER COLUMN "tenderId" DROP NOT NULL;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "auctionCode" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "referenceNo" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "linkedBidId" INTEGER;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "linkedRequirementId" INTEGER;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "buyerOrgId" INTEGER;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "createdByUserId" INTEGER;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "basePrice" DECIMAL(18,2);
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "reservePrice" DECIMAL(18,2);
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "currentLowestAmount" DECIMAL(18,2);
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "minDecrementAmount" DECIMAL(18,2);
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "minDecrementPercent" DECIMAL(5,2);
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "autoExtensionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "autoExtensionWindowMinutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "autoExtensionByMinutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "maxAutoExtensions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "extensionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "visibilityMode" "AuctionVisibilityMode" NOT NULL DEFAULT 'INVITED_SELLERS_ONLY';
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "allowCompetitorNames" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "actualStartedAt" TIMESTAMP(3);
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "actualClosedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Auction_auctionCode_key" ON "Auction"("auctionCode");
CREATE INDEX IF NOT EXISTS "Auction_status_startTime_endTime_idx" ON "Auction"("status", "startTime", "endTime");
CREATE INDEX IF NOT EXISTS "Auction_buyerOrgId_status_idx" ON "Auction"("buyerOrgId", "status");
CREATE INDEX IF NOT EXISTS "Auction_linkedBidId_idx" ON "Auction"("linkedBidId");
CREATE INDEX IF NOT EXISTS "Auction_linkedRequirementId_idx" ON "Auction"("linkedRequirementId");

ALTER TABLE "AuctionBid" ADD COLUMN IF NOT EXISTS "participantId" INTEGER;
ALTER TABLE "AuctionBid" ADD COLUMN IF NOT EXISTS "sellerOrgId" INTEGER;
ALTER TABLE "AuctionBid" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(18,2);
ALTER TABLE "AuctionBid" ADD COLUMN IF NOT EXISTS "rankAtSubmission" INTEGER;
ALTER TABLE "AuctionBid" ADD COLUMN IF NOT EXISTS "isValid" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AuctionBid" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "AuctionBid" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AuctionBid" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

CREATE INDEX IF NOT EXISTS "AuctionBid_auctionId_amount_submittedAt_idx" ON "AuctionBid"("auctionId", "amount", "submittedAt");
CREATE INDEX IF NOT EXISTS "AuctionBid_participantId_idx" ON "AuctionBid"("participantId");
CREATE INDEX IF NOT EXISTS "AuctionBid_sellerOrgId_idx" ON "AuctionBid"("sellerOrgId");

CREATE TABLE IF NOT EXISTS "AuctionParticipant" (
  "id" SERIAL PRIMARY KEY,
  "auctionId" INTEGER NOT NULL,
  "sellerOrgId" INTEGER NOT NULL,
  "sellerUserId" INTEGER,
  "status" "ParticipantStatus" NOT NULL DEFAULT 'INVITED',
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "disqualificationReason" TEXT,
  "lastBidAmount" DECIMAL(18,2),
  "currentRank" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuctionParticipant_auctionId_sellerOrgId_key" ON "AuctionParticipant"("auctionId", "sellerOrgId");
CREATE INDEX IF NOT EXISTS "AuctionParticipant_auctionId_status_idx" ON "AuctionParticipant"("auctionId", "status");
CREATE INDEX IF NOT EXISTS "AuctionParticipant_sellerOrgId_status_idx" ON "AuctionParticipant"("sellerOrgId", "status");
CREATE INDEX IF NOT EXISTS "AuctionParticipant_sellerUserId_idx" ON "AuctionParticipant"("sellerUserId");

CREATE TABLE IF NOT EXISTS "AuctionEventLog" (
  "id" SERIAL PRIMARY KEY,
  "auctionId" INTEGER NOT NULL,
  "actorUserId" INTEGER,
  "actorOrgId" INTEGER,
  "eventType" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AuctionEventLog_auctionId_createdAt_idx" ON "AuctionEventLog"("auctionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuctionEventLog_eventType_idx" ON "AuctionEventLog"("eventType");

CREATE TABLE IF NOT EXISTS "OfflinePaymentProof" (
  "id" SERIAL PRIMARY KEY,
  "paymentTransactionId" INTEGER,
  "purchaseOrderId" INTEGER,
  "buyerOrgId" INTEGER,
  "sellerOrgId" INTEGER,
  "amount" DECIMAL(18,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "transactionReference" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "payerBankName" TEXT NOT NULL,
  "payerAccountLast4" TEXT,
  "beneficiaryBankName" TEXT,
  "receiptFileUrl" TEXT,
  "receiptFileId" INTEGER,
  "remarks" TEXT,
  "status" "OfflinePaymentProofStatus" NOT NULL DEFAULT 'UPLOADED',
  "uploadedByUserId" INTEGER NOT NULL,
  "verifiedByUserId" INTEGER,
  "verifiedAt" TIMESTAMP(3),
  "rejectedByUserId" INTEGER,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "OfflinePaymentProof_buyerOrgId_transactionReference_key" ON "OfflinePaymentProof"("buyerOrgId", "transactionReference");
CREATE INDEX IF NOT EXISTS "OfflinePaymentProof_paymentTransactionId_idx" ON "OfflinePaymentProof"("paymentTransactionId");
CREATE INDEX IF NOT EXISTS "OfflinePaymentProof_purchaseOrderId_idx" ON "OfflinePaymentProof"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "OfflinePaymentProof_buyerOrgId_idx" ON "OfflinePaymentProof"("buyerOrgId");
CREATE INDEX IF NOT EXISTS "OfflinePaymentProof_sellerOrgId_idx" ON "OfflinePaymentProof"("sellerOrgId");
CREATE INDEX IF NOT EXISTS "OfflinePaymentProof_status_paymentDate_idx" ON "OfflinePaymentProof"("status", "paymentDate");
CREATE INDEX IF NOT EXISTS "OfflinePaymentProof_createdAt_idx" ON "OfflinePaymentProof"("createdAt");

ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "districtId" INTEGER;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "documentId" INTEGER;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "targetUrl" TEXT;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "uploadedByOrgId" INTEGER;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "uploadedByUserId" INTEGER;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "bannerType" "BannerType" NOT NULL DEFAULT 'DEFAULT_ADMIN';
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "status" "BannerStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "startAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "endAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "durationDays" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "displayLocation" "BannerDisplayLocation" NOT NULL DEFAULT 'HOME_HERO';
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "approvedByUserId" INTEGER;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "MarketplaceBanner" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "MarketplaceBanner_status_startAt_endAt_priority_displayLocation_idx" ON "MarketplaceBanner"("status", "startAt", "endAt", "priority", "displayLocation");
CREATE INDEX IF NOT EXISTS "MarketplaceBanner_uploadedByOrgId_idx" ON "MarketplaceBanner"("uploadedByOrgId");
CREATE INDEX IF NOT EXISTS "MarketplaceBanner_bannerType_idx" ON "MarketplaceBanner"("bannerType");

CREATE TABLE IF NOT EXISTS "OrganizationMonthlyRank" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "organizationType" "OrganizationRankType" NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "totalPurchaseValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalSalesValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "orderCount" INTEGER NOT NULL DEFAULT 0,
  "rank" INTEGER NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMonthlyRank_organizationId_organizationType_month_year_key" ON "OrganizationMonthlyRank"("organizationId", "organizationType", "month", "year");
CREATE INDEX IF NOT EXISTS "OrganizationMonthlyRank_month_year_organizationType_rank_idx" ON "OrganizationMonthlyRank"("month", "year", "organizationType", "rank");
CREATE INDEX IF NOT EXISTS "OrganizationMonthlyRank_organizationId_idx" ON "OrganizationMonthlyRank"("organizationId");

CREATE TABLE IF NOT EXISTS "BannerEligibility" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "rankId" INTEGER,
  "eligibilityType" "BannerEligibilityType" NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "isEligible" BOOLEAN NOT NULL DEFAULT true,
  "grantedByUserId" INTEGER,
  "revokedByUserId" INTEGER,
  "usedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "BannerEligibility_organizationId_month_year_eligibilityType_key" ON "BannerEligibility"("organizationId", "month", "year", "eligibilityType");
CREATE INDEX IF NOT EXISTS "BannerEligibility_organizationId_isEligible_idx" ON "BannerEligibility"("organizationId", "isEligible");
CREATE INDEX IF NOT EXISTS "BannerEligibility_month_year_eligibilityType_idx" ON "BannerEligibility"("month", "year", "eligibilityType");
CREATE INDEX IF NOT EXISTS "BannerEligibility_rankId_idx" ON "BannerEligibility"("rankId");
