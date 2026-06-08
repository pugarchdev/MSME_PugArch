CREATE TYPE "ProcurementBidStatus" AS ENUM ('DRAFT','PENDING_ADMIN_APPROVAL','APPROVED','OPEN','CLOSED','TECHNICAL_EVALUATION','FINANCIAL_EVALUATION','AWARDED','CANCELLED','EXPIRED');
CREATE TYPE "ProcurementApprovalStatus" AS ENUM ('DRAFT','PENDING','APPROVED','REJECTED');
CREATE TYPE "ProcurementLifecycleStage" AS ENUM ('BID_PUBLISHED','SELLER_PARTICIPATION','TECHNICAL_EVALUATION','FINANCIAL_EVALUATION','L1_SELECTION','AWARDED');
CREATE TYPE "ProcurementDocumentVisibility" AS ENUM ('PUBLIC','SELLER_AFTER_LOGIN','BUYER_ADMIN_ONLY');
CREATE TYPE "ProcurementTechnicalStatus" AS ENUM ('PENDING','UNDER_REVIEW','QUALIFIED','DISQUALIFIED','CLARIFICATION_REQUIRED');
CREATE TYPE "ProcurementFinancialStatus" AS ENUM ('LOCKED','NOT_OPENED','OPENED','EVALUATED');
CREATE TYPE "ProcurementFinalStatus" AS ENUM ('PENDING','L1','L2','L3','AWARDED','NOT_SELECTED','REJECTED');
CREATE TYPE "ProcurementSubmissionStatus" AS ENUM ('DRAFT','SUBMITTED','WITHDRAWN');
CREATE TYPE "ProcurementDocumentCategory" AS ENUM ('GST_CERTIFICATE','PAN_CARD','UDYAM_CERTIFICATE','COMPANY_REGISTRATION','TECHNICAL_COMPLIANCE','PRODUCT_CATALOGUE','EXPERIENCE_CERTIFICATE','FINANCIAL_QUOTE','PRICE_BREAKUP','AUTHORIZATION_LETTER','BANK_DETAILS','OTHER');
CREATE TYPE "ProcurementDocumentStatus" AS ENUM ('UPLOADED','ACCEPTED','REJECTED');
CREATE TYPE "ProcurementClarificationStatus" AS ENUM ('PENDING','RESPONDED','COMPLETED','REOPENED','REJECTED','EXPIRED');
CREATE TYPE "ProcurementEvaluationType" AS ENUM ('TECHNICAL','FINANCIAL');
CREATE TYPE "ProcurementAwardStatus" AS ENUM ('RECOMMENDED','ADMIN_APPROVED','REJECTED');

CREATE TABLE "ProcurementBid" (
  "id" SERIAL PRIMARY KEY,
  "bidNumber" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "buyerId" INTEGER NOT NULL,
  "buyerOrganizationId" INTEGER,
  "buyerOrganizationName" TEXT NOT NULL,
  "buyerType" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subCategory" TEXT,
  "bidType" TEXT NOT NULL,
  "procurementType" TEXT,
  "quantity" DECIMAL(18,3),
  "unit" TEXT,
  "estimatedValue" DECIMAL(18,2),
  "deliveryLocation" TEXT NOT NULL,
  "state" TEXT,
  "district" TEXT,
  "pincode" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "technicalOpeningDate" TIMESTAMP(3),
  "financialOpeningDate" TIMESTAMP(3),
  "bidValidityDate" TIMESTAMP(3),
  "status" "ProcurementBidStatus" NOT NULL DEFAULT 'DRAFT',
  "approvalStatus" "ProcurementApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  "lifecycleStage" "ProcurementLifecycleStage" NOT NULL DEFAULT 'BID_PUBLISHED',
  "evaluationMethod" TEXT NOT NULL DEFAULT 'L1',
  "isEmdRequired" BOOLEAN NOT NULL DEFAULT false,
  "emdAmount" DECIMAL(18,2),
  "documentFee" DECIMAL(18,2),
  "allowClarification" BOOLEAN NOT NULL DEFAULT true,
  "allowReverseAuction" BOOLEAN NOT NULL DEFAULT false,
  "allowBoq" BOOLEAN NOT NULL DEFAULT false,
  "termsAndConditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "eligibilityCriteria" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requiredDocuments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "approvedById" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "rejectedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementBid_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBid_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBid_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ProcurementBidDocument" (
  "id" SERIAL PRIMARY KEY,
  "bidId" INTEGER NOT NULL,
  "documentType" TEXT NOT NULL,
  "fileAssetId" INTEGER,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT,
  "fileKey" TEXT,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "uploadedById" INTEGER NOT NULL,
  "visibility" "ProcurementDocumentVisibility" NOT NULL DEFAULT 'BUYER_ADMIN_ONLY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementBidDocument_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "ProcurementBid"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProcurementBidParticipation" (
  "id" SERIAL PRIMARY KEY,
  "bidId" INTEGER NOT NULL,
  "sellerId" INTEGER NOT NULL,
  "participationNumber" TEXT NOT NULL UNIQUE,
  "technicalStatus" "ProcurementTechnicalStatus" NOT NULL DEFAULT 'PENDING',
  "financialStatus" "ProcurementFinancialStatus" NOT NULL DEFAULT 'LOCKED',
  "finalStatus" "ProcurementFinalStatus" NOT NULL DEFAULT 'PENDING',
  "rank" INTEGER,
  "quotedAmount" DECIMAL(18,2),
  "gstPercentage" DECIMAL(5,2),
  "totalAmount" DECIMAL(18,2),
  "makeBrand" TEXT,
  "model" TEXT,
  "offeredItemDescription" TEXT,
  "submissionStatus" "ProcurementSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "technicalSubmittedAt" TIMESTAMP(3),
  "financialSubmittedAt" TIMESTAMP(3),
  "isWithdrawn" BOOLEAN NOT NULL DEFAULT false,
  "withdrawnAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementBidParticipation_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "ProcurementBid"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidParticipation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProcurementBidParticipationDocument" (
  "id" SERIAL PRIMARY KEY,
  "participationId" INTEGER NOT NULL,
  "bidId" INTEGER NOT NULL,
  "sellerId" INTEGER NOT NULL,
  "documentCategory" "ProcurementDocumentCategory" NOT NULL,
  "documentName" TEXT NOT NULL,
  "fileAssetId" INTEGER,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT,
  "fileKey" TEXT,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "documentStatus" "ProcurementDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementBidParticipationDocument_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "ProcurementBidParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidParticipationDocument_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProcurementBidClarification" (
  "id" SERIAL PRIMARY KEY,
  "bidId" INTEGER NOT NULL,
  "participationId" INTEGER NOT NULL,
  "sellerId" INTEGER NOT NULL,
  "buyerId" INTEGER NOT NULL,
  "requestNumber" TEXT NOT NULL UNIQUE,
  "clarificationType" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "response" TEXT,
  "status" "ProcurementClarificationStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" INTEGER NOT NULL,
  "respondedById" INTEGER,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementBidClarification_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "ProcurementBid"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidClarification_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "ProcurementBidParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidClarification_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidClarification_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidClarification_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidClarification_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ProcurementBidClarificationFile" (
  "id" SERIAL PRIMARY KEY,
  "clarificationId" INTEGER NOT NULL,
  "fileAssetId" INTEGER,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT,
  "fileKey" TEXT,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "uploadedById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementBidClarificationFile_clarificationId_fkey" FOREIGN KEY ("clarificationId") REFERENCES "ProcurementBidClarification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidClarificationFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProcurementBidEvaluation" (
  "id" SERIAL PRIMARY KEY,
  "bidId" INTEGER NOT NULL,
  "participationId" INTEGER NOT NULL,
  "sellerId" INTEGER NOT NULL,
  "evaluatorId" INTEGER NOT NULL,
  "evaluationType" "ProcurementEvaluationType" NOT NULL,
  "status" TEXT NOT NULL,
  "remarks" TEXT,
  "score" DECIMAL(8,2),
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementBidEvaluation_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "ProcurementBid"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidEvaluation_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "ProcurementBidParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProcurementBidAward" (
  "id" SERIAL PRIMARY KEY,
  "bidId" INTEGER NOT NULL,
  "participationId" INTEGER NOT NULL,
  "sellerId" INTEGER NOT NULL,
  "awardedAmount" DECIMAL(18,2) NOT NULL,
  "awardStatus" "ProcurementAwardStatus" NOT NULL DEFAULT 'RECOMMENDED',
  "awardedById" INTEGER NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementBidAward_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "ProcurementBid"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidAward_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "ProcurementBidParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidAward_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProcurementBidAward_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProcurementAuditLog" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "role" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProcurementBidParticipation_bidId_sellerId_key" ON "ProcurementBidParticipation"("bidId","sellerId");
CREATE UNIQUE INDEX "ProcurementBidAward_bidId_participationId_key" ON "ProcurementBidAward"("bidId","participationId");

CREATE INDEX "ProcurementBid_status_approvalStatus_idx" ON "ProcurementBid"("status","approvalStatus");
CREATE INDEX "ProcurementBid_buyerId_status_idx" ON "ProcurementBid"("buyerId","status");
CREATE INDEX "ProcurementBid_buyerOrganizationId_idx" ON "ProcurementBid"("buyerOrganizationId");
CREATE INDEX "ProcurementBid_category_idx" ON "ProcurementBid"("category");
CREATE INDEX "ProcurementBid_district_state_idx" ON "ProcurementBid"("district","state");
CREATE INDEX "ProcurementBid_endDate_idx" ON "ProcurementBid"("endDate");
CREATE INDEX "ProcurementBidDocument_bidId_visibility_idx" ON "ProcurementBidDocument"("bidId","visibility");
CREATE INDEX "ProcurementBidDocument_uploadedById_idx" ON "ProcurementBidDocument"("uploadedById");
CREATE INDEX "ProcurementBidParticipation_sellerId_submissionStatus_idx" ON "ProcurementBidParticipation"("sellerId","submissionStatus");
CREATE INDEX "ProcurementBidParticipation_bidId_technicalStatus_financialStatus_idx" ON "ProcurementBidParticipation"("bidId","technicalStatus","financialStatus");
CREATE INDEX "ProcurementBidParticipationDocument_participationId_documentCategory_idx" ON "ProcurementBidParticipationDocument"("participationId","documentCategory");
CREATE INDEX "ProcurementBidParticipationDocument_bidId_sellerId_idx" ON "ProcurementBidParticipationDocument"("bidId","sellerId");
CREATE INDEX "ProcurementBidClarification_bidId_status_idx" ON "ProcurementBidClarification"("bidId","status");
CREATE INDEX "ProcurementBidClarification_participationId_idx" ON "ProcurementBidClarification"("participationId");
CREATE INDEX "ProcurementBidClarification_sellerId_idx" ON "ProcurementBidClarification"("sellerId");
CREATE INDEX "ProcurementBidClarificationFile_clarificationId_idx" ON "ProcurementBidClarificationFile"("clarificationId");
CREATE INDEX "ProcurementBidClarificationFile_uploadedById_idx" ON "ProcurementBidClarificationFile"("uploadedById");
CREATE INDEX "ProcurementBidEvaluation_bidId_evaluationType_idx" ON "ProcurementBidEvaluation"("bidId","evaluationType");
CREATE INDEX "ProcurementBidEvaluation_participationId_evaluationType_idx" ON "ProcurementBidEvaluation"("participationId","evaluationType");
CREATE INDEX "ProcurementBidAward_sellerId_idx" ON "ProcurementBidAward"("sellerId");
CREATE INDEX "ProcurementAuditLog_entityType_entityId_idx" ON "ProcurementAuditLog"("entityType","entityId");
CREATE INDEX "ProcurementAuditLog_userId_createdAt_idx" ON "ProcurementAuditLog"("userId","createdAt");
CREATE INDEX "ProcurementAuditLog_action_createdAt_idx" ON "ProcurementAuditLog"("action","createdAt");
