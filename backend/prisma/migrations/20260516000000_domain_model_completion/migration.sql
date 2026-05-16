-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_TECHNICAL_EVALUATION', 'TECHNICALLY_QUALIFIED', 'TECHNICALLY_REJECTED', 'UNDER_FINANCIAL_EVALUATION', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'PAUSED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('INVITED', 'INTERESTED', 'DECLINED', 'BID_SUBMITTED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SOURCING', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DirectPurchaseStatus" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'REJECTED', 'ORDERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('DRAFT', 'SENT', 'RESPONDED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('GENERATED', 'ISSUED', 'ACCEPTED', 'IN_FULFILLMENT', 'DELIVERED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('CREATED', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELAYED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'WAIVED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('CREATED', 'FUNDED', 'HELD', 'PARTIALLY_RELEASED', 'RELEASED', 'FROZEN', 'REFUNDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'QUALIFIED', 'DISQUALIFIED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'TERMINATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PURCHASE', 'RATE_CONTRACT', 'SERVICE_AGREEMENT', 'FRAMEWORK_AGREEMENT');

-- CreateEnum
CREATE TYPE "SLAStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BREACHED', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DEBIT', 'CREDIT', 'ESCROW_HOLD', 'ESCROW_RELEASE', 'REFUND', 'FEE', 'TAX');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "MilestonePaymentStatus" AS ENUM ('PENDING', 'DUE', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'AWAITING_RESPONSE', 'RESOLVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GrievanceStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "TenderStatusV2" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED', 'BID_SUBMISSION', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'AWARDED', 'PO_GENERATED', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Tender" ADD COLUMN     "awardedBidId" INTEGER,
ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "organizationId" INTEGER,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "requirementId" INTEGER,
ADD COLUMN     "statusEnum" "TenderStatusV2";

-- AlterTable
ALTER TABLE "Bid" ADD COLUMN     "bidNumber" TEXT,
ADD COLUMN     "modifiedAt" TIMESTAMP(3),
ADD COLUMN     "statusEnum" "BidStatus";

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "statusEnum" "QuoteRequestStatus";

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "currentLowestBid" DECIMAL(18,2),
ADD COLUMN     "currentWinnerId" INTEGER,
ADD COLUMN     "statusEnum" "AuctionStatus";

-- AlterTable
ALTER TABLE "ComplianceViolation" ADD COLUMN     "entityId" INTEGER,
ADD COLUMN     "entityType" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "pdfFileId" INTEGER,
ADD COLUMN     "poStatus" "POStatus",
ADD COLUMN     "sourceId" INTEGER,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "cgstAmount" DECIMAL(18,2),
ADD COLUMN     "igstAmount" DECIMAL(18,2),
ADD COLUMN     "invoiceFileId" INTEGER,
ADD COLUMN     "invoiceStatus" "InvoiceStatus",
ADD COLUMN     "sgstAmount" DECIMAL(18,2),
ADD COLUMN     "taxableAmount" DECIMAL(18,2),
ADD COLUMN     "tdsAmount" DECIMAL(18,2),
ADD COLUMN     "totalTaxAmount" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "paymentStatus" "PaymentStatus";

-- AlterTable
ALTER TABLE "FinancialLedgerEntry" ADD COLUMN     "entryTypeEnum" "LedgerEntryType";

-- AlterTable
ALTER TABLE "EscrowAccount" ADD COLUMN     "escrowStatus" "EscrowStatus";

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "statusEnum" "MilestoneStatus";

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "statusEnum" "DisputeStatus";

-- AlterTable
ALTER TABLE "GrievanceTicket" ADD COLUMN     "slaStatus" "SLAStatus",
ADD COLUMN     "statusEnum" "GrievanceStatus";

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER,
    "organizationId" INTEGER,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" "CategoryType" NOT NULL DEFAULT 'BOTH',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "organizationId" INTEGER,
    "categoryId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "hsnCode" TEXT,
    "brand" TEXT,
    "modelNumber" TEXT,
    "unitOfMeasure" TEXT,
    "price" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "isMsmeMade" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "fileAssetId" INTEGER NOT NULL,
    "altText" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSpecification" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "organizationId" INTEGER,
    "categoryId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'CUSTOM',
    "basePrice" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "serviceArea" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" SERIAL NOT NULL,
    "sellerProfileId" INTEGER,
    "productId" INTEGER,
    "serviceId" INTEGER,
    "name" TEXT NOT NULL,
    "issuingAuthority" TEXT,
    "certificateNumber" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "fileAssetId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" SERIAL NOT NULL,
    "requirementNumber" TEXT NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "organizationId" INTEGER,
    "categoryId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "procurementMethod" "ProcurementMethod" NOT NULL DEFAULT 'TENDER',
    "status" "RequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "estimatedValue" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "requiredBy" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementItem" (
    "id" SERIAL NOT NULL,
    "requirementId" INTEGER NOT NULL,
    "productId" INTEGER,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "estimatedUnitPrice" DECIMAL(18,2),
    "specifications" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectPurchase" (
    "id" SERIAL NOT NULL,
    "requirementId" INTEGER,
    "buyerId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "purchaseNumber" TEXT NOT NULL,
    "status" "DirectPurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteResponse" (
    "id" SERIAL NOT NULL,
    "quoteRequestId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "responseNumber" TEXT,
    "status" "QuoteResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "deliveryDays" INTEGER,
    "validityDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderItem" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "requirementItemId" INTEGER,
    "productId" INTEGER,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "estimatedUnitPrice" DECIMAL(18,2),
    "specifications" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderDocument" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "fileAssetId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderParticipant" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidItem" (
    "id" SERIAL NOT NULL,
    "bidId" INTEGER NOT NULL,
    "tenderItemId" INTEGER,
    "productId" INTEGER,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "totalPrice" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(5,2),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalEvaluationCriteria" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" DECIMAL(8,2) NOT NULL,
    "weightage" DECIMAL(5,2),
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalEvaluationCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalEvaluationResult" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "bidId" INTEGER NOT NULL,
    "criteriaId" INTEGER NOT NULL,
    "evaluatorId" INTEGER,
    "score" DECIMAL(8,2) NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalEvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEvaluation" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "bidId" INTEGER NOT NULL,
    "evaluatorId" INTEGER,
    "quotedAmount" DECIMAL(18,2) NOT NULL,
    "evaluatedAmount" DECIMAL(18,2),
    "rank" INTEGER,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparativeStatement" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "bidId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "summary" JSONB NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComparativeStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" SERIAL NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "tenderId" INTEGER,
    "bidId" INTEGER,
    "contractType" "ContractType" NOT NULL DEFAULT 'PURCHASE',
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" INTEGER NOT NULL,
    "productId" INTEGER,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(5,2),
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryTracking" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" INTEGER NOT NULL,
    "trackingNumber" TEXT,
    "carrierName" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'CREATED',
    "expectedDelivery" TIMESTAMP(3),
    "actualDelivery" TIMESTAMP(3),
    "currentLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryTrackingEvent" (
    "id" SERIAL NOT NULL,
    "deliveryTrackingId" INTEGER NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "location" TEXT,
    "remarks" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionReport" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" INTEGER NOT NULL,
    "reportNumber" TEXT,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "inspectedBy" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "acceptedQuantity" DECIMAL(18,3),
    "rejectedQuantity" DECIMAL(18,3),
    "remarks" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "purchaseOrderItemId" INTEGER,
    "productId" INTEGER,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "taxableAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2),
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestonePayment" (
    "id" SERIAL NOT NULL,
    "milestoneId" INTEGER,
    "invoiceId" INTEGER,
    "paymentNumber" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "MilestonePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MilestonePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRating" (
    "id" SERIAL NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "purchaseOrderId" INTEGER,
    "rating" INTEGER NOT NULL,
    "review" TEXT,
    "qualityScore" INTEGER,
    "deliveryScore" INTEGER,
    "communicationScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerRating" (
    "id" SERIAL NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "purchaseOrderId" INTEGER,
    "rating" INTEGER NOT NULL,
    "review" TEXT,
    "paymentTimelinessScore" INTEGER,
    "communicationScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_organizationId_idx" ON "Category"("organizationId");

-- CreateIndex
CREATE INDEX "Category_type_idx" ON "Category"("type");

-- CreateIndex
CREATE INDEX "Category_isActive_idx" ON "Category"("isActive");

-- CreateIndex
CREATE INDEX "Product_sellerId_idx" ON "Product"("sellerId");

-- CreateIndex
CREATE INDEX "Product_organizationId_idx" ON "Product"("organizationId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "ProductImage_fileAssetId_idx" ON "ProductImage"("fileAssetId");

-- CreateIndex
CREATE INDEX "ProductSpecification_productId_idx" ON "ProductSpecification"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSpecification_productId_name_key" ON "ProductSpecification"("productId", "name");

-- CreateIndex
CREATE INDEX "Service_sellerId_idx" ON "Service"("sellerId");

-- CreateIndex
CREATE INDEX "Service_organizationId_idx" ON "Service"("organizationId");

-- CreateIndex
CREATE INDEX "Service_categoryId_idx" ON "Service"("categoryId");

-- CreateIndex
CREATE INDEX "Service_status_idx" ON "Service"("status");

-- CreateIndex
CREATE INDEX "Certification_sellerProfileId_idx" ON "Certification"("sellerProfileId");

-- CreateIndex
CREATE INDEX "Certification_productId_idx" ON "Certification"("productId");

-- CreateIndex
CREATE INDEX "Certification_serviceId_idx" ON "Certification"("serviceId");

-- CreateIndex
CREATE INDEX "Certification_verificationStatus_idx" ON "Certification"("verificationStatus");

-- CreateIndex
CREATE INDEX "Certification_expiresAt_idx" ON "Certification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_requirementNumber_key" ON "Requirement"("requirementNumber");

-- CreateIndex
CREATE INDEX "Requirement_buyerId_idx" ON "Requirement"("buyerId");

-- CreateIndex
CREATE INDEX "Requirement_organizationId_idx" ON "Requirement"("organizationId");

-- CreateIndex
CREATE INDEX "Requirement_categoryId_idx" ON "Requirement"("categoryId");

-- CreateIndex
CREATE INDEX "Requirement_status_idx" ON "Requirement"("status");

-- CreateIndex
CREATE INDEX "Requirement_procurementMethod_idx" ON "Requirement"("procurementMethod");

-- CreateIndex
CREATE INDEX "RequirementItem_requirementId_idx" ON "RequirementItem"("requirementId");

-- CreateIndex
CREATE INDEX "RequirementItem_productId_idx" ON "RequirementItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectPurchase_purchaseNumber_key" ON "DirectPurchase"("purchaseNumber");

-- CreateIndex
CREATE INDEX "DirectPurchase_requirementId_idx" ON "DirectPurchase"("requirementId");

-- CreateIndex
CREATE INDEX "DirectPurchase_buyerId_status_idx" ON "DirectPurchase"("buyerId", "status");

-- CreateIndex
CREATE INDEX "DirectPurchase_sellerId_status_idx" ON "DirectPurchase"("sellerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteResponse_responseNumber_key" ON "QuoteResponse"("responseNumber");

-- CreateIndex
CREATE INDEX "QuoteResponse_quoteRequestId_idx" ON "QuoteResponse"("quoteRequestId");

-- CreateIndex
CREATE INDEX "QuoteResponse_sellerId_status_idx" ON "QuoteResponse"("sellerId", "status");

-- CreateIndex
CREATE INDEX "TenderItem_tenderId_idx" ON "TenderItem"("tenderId");

-- CreateIndex
CREATE INDEX "TenderItem_requirementItemId_idx" ON "TenderItem"("requirementItemId");

-- CreateIndex
CREATE INDEX "TenderItem_productId_idx" ON "TenderItem"("productId");

-- CreateIndex
CREATE INDEX "TenderDocument_tenderId_idx" ON "TenderDocument"("tenderId");

-- CreateIndex
CREATE INDEX "TenderDocument_fileAssetId_idx" ON "TenderDocument"("fileAssetId");

-- CreateIndex
CREATE INDEX "TenderDocument_documentType_idx" ON "TenderDocument"("documentType");

-- CreateIndex
CREATE INDEX "TenderParticipant_sellerId_status_idx" ON "TenderParticipant"("sellerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenderParticipant_tenderId_sellerId_key" ON "TenderParticipant"("tenderId", "sellerId");

-- CreateIndex
CREATE INDEX "BidItem_bidId_idx" ON "BidItem"("bidId");

-- CreateIndex
CREATE INDEX "BidItem_tenderItemId_idx" ON "BidItem"("tenderItemId");

-- CreateIndex
CREATE INDEX "BidItem_productId_idx" ON "BidItem"("productId");

-- CreateIndex
CREATE INDEX "TechnicalEvaluationCriteria_tenderId_idx" ON "TechnicalEvaluationCriteria"("tenderId");

-- CreateIndex
CREATE INDEX "TechnicalEvaluationResult_tenderId_idx" ON "TechnicalEvaluationResult"("tenderId");

-- CreateIndex
CREATE INDEX "TechnicalEvaluationResult_evaluatorId_idx" ON "TechnicalEvaluationResult"("evaluatorId");

-- CreateIndex
CREATE INDEX "TechnicalEvaluationResult_status_idx" ON "TechnicalEvaluationResult"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalEvaluationResult_bidId_criteriaId_key" ON "TechnicalEvaluationResult"("bidId", "criteriaId");

-- CreateIndex
CREATE INDEX "FinancialEvaluation_tenderId_idx" ON "FinancialEvaluation"("tenderId");

-- CreateIndex
CREATE INDEX "FinancialEvaluation_bidId_idx" ON "FinancialEvaluation"("bidId");

-- CreateIndex
CREATE INDEX "FinancialEvaluation_status_idx" ON "FinancialEvaluation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEvaluation_tenderId_bidId_key" ON "FinancialEvaluation"("tenderId", "bidId");

-- CreateIndex
CREATE INDEX "ComparativeStatement_tenderId_idx" ON "ComparativeStatement"("tenderId");

-- CreateIndex
CREATE INDEX "ComparativeStatement_bidId_idx" ON "ComparativeStatement"("bidId");

-- CreateIndex
CREATE INDEX "ComparativeStatement_recommended_idx" ON "ComparativeStatement"("recommended");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractNumber_key" ON "Contract"("contractNumber");

-- CreateIndex
CREATE INDEX "Contract_tenderId_idx" ON "Contract"("tenderId");

-- CreateIndex
CREATE INDEX "Contract_bidId_idx" ON "Contract"("bidId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "Contract_contractType_idx" ON "Contract"("contractType");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_productId_idx" ON "PurchaseOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryTracking_trackingNumber_key" ON "DeliveryTracking"("trackingNumber");

-- CreateIndex
CREATE INDEX "DeliveryTracking_purchaseOrderId_idx" ON "DeliveryTracking"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "DeliveryTracking_status_idx" ON "DeliveryTracking"("status");

-- CreateIndex
CREATE INDEX "DeliveryTrackingEvent_deliveryTrackingId_idx" ON "DeliveryTrackingEvent"("deliveryTrackingId");

-- CreateIndex
CREATE INDEX "DeliveryTrackingEvent_status_idx" ON "DeliveryTrackingEvent"("status");

-- CreateIndex
CREATE INDEX "DeliveryTrackingEvent_occurredAt_idx" ON "DeliveryTrackingEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionReport_reportNumber_key" ON "InspectionReport"("reportNumber");

-- CreateIndex
CREATE INDEX "InspectionReport_purchaseOrderId_idx" ON "InspectionReport"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "InspectionReport_status_idx" ON "InspectionReport"("status");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_purchaseOrderItemId_idx" ON "InvoiceItem"("purchaseOrderItemId");

-- CreateIndex
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "MilestonePayment_paymentNumber_key" ON "MilestonePayment"("paymentNumber");

-- CreateIndex
CREATE INDEX "MilestonePayment_milestoneId_idx" ON "MilestonePayment"("milestoneId");

-- CreateIndex
CREATE INDEX "MilestonePayment_invoiceId_idx" ON "MilestonePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "MilestonePayment_status_idx" ON "MilestonePayment"("status");

-- CreateIndex
CREATE INDEX "SupplierRating_buyerId_idx" ON "SupplierRating"("buyerId");

-- CreateIndex
CREATE INDEX "SupplierRating_sellerId_idx" ON "SupplierRating"("sellerId");

-- CreateIndex
CREATE INDEX "SupplierRating_purchaseOrderId_idx" ON "SupplierRating"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "BuyerRating_sellerId_idx" ON "BuyerRating"("sellerId");

-- CreateIndex
CREATE INDEX "BuyerRating_buyerId_idx" ON "BuyerRating"("buyerId");

-- CreateIndex
CREATE INDEX "BuyerRating_purchaseOrderId_idx" ON "BuyerRating"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "Tender_categoryId_idx" ON "Tender"("categoryId");

-- CreateIndex
CREATE INDEX "Tender_requirementId_idx" ON "Tender"("requirementId");

-- CreateIndex
CREATE INDEX "Tender_organizationId_idx" ON "Tender"("organizationId");

-- CreateIndex
CREATE INDEX "Tender_statusEnum_idx" ON "Tender"("statusEnum");

-- CreateIndex
CREATE INDEX "Tender_awardedBidId_idx" ON "Tender"("awardedBidId");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_bidNumber_key" ON "Bid"("bidNumber");

-- CreateIndex
CREATE INDEX "Bid_bidNumber_idx" ON "Bid"("bidNumber");

-- CreateIndex
CREATE INDEX "Bid_statusEnum_idx" ON "Bid"("statusEnum");

-- CreateIndex
CREATE INDEX "QuoteRequest_statusEnum_idx" ON "QuoteRequest"("statusEnum");

-- CreateIndex
CREATE INDEX "Auction_statusEnum_idx" ON "Auction"("statusEnum");

-- CreateIndex
CREATE INDEX "Auction_currentWinnerId_idx" ON "Auction"("currentWinnerId");

-- CreateIndex
CREATE INDEX "ComplianceViolation_entityType_entityId_idx" ON "ComplianceViolation"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_poStatus_idx" ON "PurchaseOrder"("poStatus");

-- CreateIndex
CREATE INDEX "PurchaseOrder_sourceType_sourceId_idx" ON "PurchaseOrder"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_pdfFileId_idx" ON "PurchaseOrder"("pdfFileId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceStatus_idx" ON "Invoice"("invoiceStatus");

-- CreateIndex
CREATE INDEX "Invoice_invoiceFileId_idx" ON "Invoice"("invoiceFileId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_paymentStatus_idx" ON "PaymentTransaction"("paymentStatus");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_entryTypeEnum_idx" ON "FinancialLedgerEntry"("entryTypeEnum");

-- CreateIndex
CREATE INDEX "EscrowAccount_escrowStatus_idx" ON "EscrowAccount"("escrowStatus");

-- CreateIndex
CREATE INDEX "Milestone_statusEnum_idx" ON "Milestone"("statusEnum");

-- CreateIndex
CREATE INDEX "Dispute_statusEnum_idx" ON "Dispute"("statusEnum");

-- CreateIndex
CREATE INDEX "GrievanceTicket_statusEnum_idx" ON "GrievanceTicket"("statusEnum");

-- CreateIndex
CREATE INDEX "GrievanceTicket_slaStatus_idx" ON "GrievanceTicket"("slaStatus");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementItem" ADD CONSTRAINT "RequirementItem_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementItem" ADD CONSTRAINT "RequirementItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPurchase" ADD CONSTRAINT "DirectPurchase_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteResponse" ADD CONSTRAINT "QuoteResponse_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteResponse" ADD CONSTRAINT "QuoteResponse_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_awardedBidId_fkey" FOREIGN KEY ("awardedBidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderItem" ADD CONSTRAINT "TenderItem_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderItem" ADD CONSTRAINT "TenderItem_requirementItemId_fkey" FOREIGN KEY ("requirementItemId") REFERENCES "RequirementItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderItem" ADD CONSTRAINT "TenderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderDocument" ADD CONSTRAINT "TenderDocument_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderDocument" ADD CONSTRAINT "TenderDocument_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderParticipant" ADD CONSTRAINT "TenderParticipant_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderParticipant" ADD CONSTRAINT "TenderParticipant_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidItem" ADD CONSTRAINT "BidItem_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidItem" ADD CONSTRAINT "BidItem_tenderItemId_fkey" FOREIGN KEY ("tenderItemId") REFERENCES "TenderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidItem" ADD CONSTRAINT "BidItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalEvaluationCriteria" ADD CONSTRAINT "TechnicalEvaluationCriteria_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalEvaluationResult" ADD CONSTRAINT "TechnicalEvaluationResult_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalEvaluationResult" ADD CONSTRAINT "TechnicalEvaluationResult_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalEvaluationResult" ADD CONSTRAINT "TechnicalEvaluationResult_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "TechnicalEvaluationCriteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalEvaluationResult" ADD CONSTRAINT "TechnicalEvaluationResult_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvaluation" ADD CONSTRAINT "FinancialEvaluation_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvaluation" ADD CONSTRAINT "FinancialEvaluation_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvaluation" ADD CONSTRAINT "FinancialEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparativeStatement" ADD CONSTRAINT "ComparativeStatement_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparativeStatement" ADD CONSTRAINT "ComparativeStatement_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_currentWinnerId_fkey" FOREIGN KEY ("currentWinnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTracking" ADD CONSTRAINT "DeliveryTracking_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTrackingEvent" ADD CONSTRAINT "DeliveryTrackingEvent_deliveryTrackingId_fkey" FOREIGN KEY ("deliveryTrackingId") REFERENCES "DeliveryTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_invoiceFileId_fkey" FOREIGN KEY ("invoiceFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestonePayment" ADD CONSTRAINT "MilestonePayment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestonePayment" ADD CONSTRAINT "MilestonePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRating" ADD CONSTRAINT "SupplierRating_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRating" ADD CONSTRAINT "SupplierRating_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerRating" ADD CONSTRAINT "BuyerRating_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerRating" ADD CONSTRAINT "BuyerRating_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

