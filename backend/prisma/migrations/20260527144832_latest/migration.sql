/*
  Warnings:

  - The values [active] on the enum `TenderStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `applicantName` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `authorizedPersonPan` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `bankAccount` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `branchName` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessPanName` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `businessType` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `fullAddress` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `gst` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `ifsc` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `legalEntityType` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `optForSahay` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `pincode` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `turnover` on the `SellerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `udyam` on the `SellerProfile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[pan]` on the table `SellerProfile` will be added. If there are existing duplicate values, this will fail.
  - Made the column `isDualRole` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "QuantityUnit" AS ENUM ('Nos', 'Kg', 'Ton', 'MT', 'Bag', 'Box', 'Packet', 'Set_', 'Pair', 'Roll', 'Litre', 'Meter', 'Feet', 'Piece', 'Unit_', 'Coil', 'Drum', 'Bundle', 'Carton', 'Cylinder', 'Dozen', 'Sheet', 'Plate', 'Bucket', 'Kit', 'Bottle', 'Container', 'Cum', 'SqFt', 'SqMeter');

-- CreateEnum
CREATE TYPE "MSMETypeEnum" AS ENUM ('MSME', 'NON_MSME', 'LOCAL_MSME', 'ANCILLARY_UNIT', 'STARTUP_MSME');

-- CreateEnum
CREATE TYPE "VendorTypeEnum" AS ENUM ('MANUFACTURER', 'TRADER', 'DISTRIBUTOR', 'DEALER', 'SERVICE_PROVIDER', 'CONTRACTOR', 'OEM', 'RETAIL_SUPPLIER', 'WHOLESALER');

-- CreateEnum
CREATE TYPE "RegistrationTypeEnum" AS ENUM ('GST_REGISTERED', 'UDYAM_REGISTERED', 'NSIC_REGISTERED', 'ISO_CERTIFIED', 'PAN_AVAILABLE');

-- CreateEnum
CREATE TYPE "ItemConditionEnum" AS ENUM ('NEW', 'REFURBISHED', 'USED', 'CUSTOM_MANUFACTURED');

-- CreateEnum
CREATE TYPE "PaymentTermsEnum" AS ENUM ('ADVANCE_PAYMENT', 'CREDIT_PAYMENT', 'PARTIAL_ADVANCE', 'MILESTONE_BASED', 'ON_DELIVERY');

-- CreateEnum
CREATE TYPE "DeliveryTypeEnum" AS ENUM ('IMMEDIATE_DELIVERY', 'SCHEDULED_DELIVERY', 'URGENT_DELIVERY', 'PARTIAL_DELIVERY', 'PROJECT_DELIVERY');

-- AlterEnum
BEGIN;
CREATE TYPE "TenderStatus_new" AS ENUM ('draft', 'approved', 'published', 'bid_submission', 'tech_bid_opening', 'tech_evaluation', 'financial_bid_opening', 'financial_opening', 'financial_evaluation', 'awarded', 'po_generated', 'closed');
ALTER TABLE "public"."Tender" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Tender" ALTER COLUMN "status" TYPE "TenderStatus_new" USING ("status"::text::"TenderStatus_new");
ALTER TYPE "TenderStatus" RENAME TO "TenderStatus_old";
ALTER TYPE "TenderStatus_new" RENAME TO "TenderStatus";
DROP TYPE "public"."TenderStatus_old";
ALTER TABLE "Tender" ALTER COLUMN "status" SET DEFAULT 'draft';
COMMIT;

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_rejectedById_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_cartId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_technicalApprovedById_fkey";

-- DropForeignKey
ALTER TABLE "GoodsReceiptNote" DROP CONSTRAINT "GoodsReceiptNote_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "GoodsReceiptNote" DROP CONSTRAINT "GoodsReceiptNote_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "GoodsReceiptNote" DROP CONSTRAINT "GoodsReceiptNote_receivedById_fkey";

-- DropForeignKey
ALTER TABLE "GrnDocument" DROP CONSTRAINT "GrnDocument_fileAssetId_fkey";

-- DropForeignKey
ALTER TABLE "GrnDocument" DROP CONSTRAINT "GrnDocument_grnId_fkey";

-- DropForeignKey
ALTER TABLE "GrnDocument" DROP CONSTRAINT "GrnDocument_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "GrnItem" DROP CONSTRAINT "GrnItem_grnId_fkey";

-- DropForeignKey
ALTER TABLE "OrgInvitation" DROP CONSTRAINT "OrgInvitation_invitedById_fkey";

-- DropForeignKey
ALTER TABLE "OrgInvitation" DROP CONSTRAINT "OrgInvitation_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "OrgMembership" DROP CONSTRAINT "OrgMembership_invitedById_fkey";

-- DropForeignKey
ALTER TABLE "OrgMembership" DROP CONSTRAINT "OrgMembership_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "OrgMembership" DROP CONSTRAINT "OrgMembership_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProcurementApproval" DROP CONSTRAINT "ProcurementApproval_approverId_fkey";

-- DropForeignKey
ALTER TABLE "ProcurementApproval" DROP CONSTRAINT "ProcurementApproval_organizationId_fkey";

-- DropIndex
DROP INDEX "Bid_lastIpAddress_idx";

-- AlterTable
ALTER TABLE "Auction" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Bid" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BuyerAcceptance" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Cart" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CartItem" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ComplianceViolation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliveryWorkflow" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Dispute" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EscrowAccount" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FileAsset" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GoodsReceiptNote" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GrievanceTicket" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IdempotencyKey" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InspectionRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LogisticsPartner" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Milestone" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrgMembership" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PaymentSettlement" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PaymentTransaction" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProcurementApproval" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "title" DROP DEFAULT;

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "estimatedValue" DECIMAL(18,2),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "QuoteResponse" ADD COLUMN     "documentUrl" TEXT;

-- AlterTable
ALTER TABLE "SellerBankAccount" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SellerOffice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SellerProfile" DROP COLUMN "applicantName",
DROP COLUMN "authorizedPersonPan",
DROP COLUMN "bankAccount",
DROP COLUMN "branchName",
DROP COLUMN "businessPanName",
DROP COLUMN "businessType",
DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "email",
DROP COLUMN "fullAddress",
DROP COLUMN "gst",
DROP COLUMN "ifsc",
DROP COLUMN "legalEntityType",
DROP COLUMN "optForSahay",
DROP COLUMN "pincode",
DROP COLUMN "state",
DROP COLUMN "turnover",
DROP COLUMN "udyam",
ALTER COLUMN "registrationTypes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "isDualRole" SET NOT NULL,
ALTER COLUMN "accountStatus" SET DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Certification_fileAssetId_idx" ON "Certification"("fileAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_pan_key" ON "SellerProfile"("pan");

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInvitation" ADD CONSTRAINT "OrgInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInvitation" ADD CONSTRAINT "OrgInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_technicalApprovedById_fkey" FOREIGN KEY ("technicalApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementApproval" ADD CONSTRAINT "ProcurementApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementApproval" ADD CONSTRAINT "ProcurementApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptNote" ADD CONSTRAINT "GoodsReceiptNote_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptNote" ADD CONSTRAINT "GoodsReceiptNote_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptNote" ADD CONSTRAINT "GoodsReceiptNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnItem" ADD CONSTRAINT "GrnItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceiptNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnDocument" ADD CONSTRAINT "GrnDocument_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceiptNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnDocument" ADD CONSTRAINT "GrnDocument_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnDocument" ADD CONSTRAINT "GrnDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "conversationTenderPair" RENAME TO "Conversation_tenderId_buyerId_sellerId_key";

-- RenameIndex
ALTER INDEX "DeliveryParticipant_deliveryTrackingId_userId_role_key" RENAME TO "DeliveryParticipant_deliveryTrackingId_userId_participantRo_key";
