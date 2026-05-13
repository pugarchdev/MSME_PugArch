-- Keep the production enum in sync with the current tender workflow.
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'published';
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'bid_submission';
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'tech_bid_opening';
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'tech_evaluation';
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'financial_bid_opening';
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'financial_opening';
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'financial_evaluation';
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'awarded';
ALTER TYPE "TenderStatus" ADD VALUE IF NOT EXISTS 'po_generated';

-- Cache verified GST data used by src/services/gstService.ts.
CREATE TABLE "GstCache" (
    "id" SERIAL NOT NULL,
    "gstNumber" TEXT NOT NULL,
    "legalBusinessName" TEXT NOT NULL,
    "tradeName" TEXT,
    "constitutionOfBusiness" TEXT,
    "registrationDate" TIMESTAMP(3),
    "taxpayerType" TEXT,
    "businessAddress" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "lastVerified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GstCache_gstNumber_key" ON "GstCache"("gstNumber");
