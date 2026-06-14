-- Additive dispute management and dynamic organization role foundation.

DO $$ BEGIN
  CREATE TYPE "DisputePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DisputeMessageVisibility" AS ENUM ('PUBLIC_TO_PARTIES', 'ADMIN_INTERNAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OrgInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AccessTransferStatus" AS ENUM ('INITIATED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "DisputeStatus" ADD VALUE IF NOT EXISTS 'CLARIFICATION_REQUESTED';
ALTER TYPE "DisputeStatus" ADD VALUE IF NOT EXISTS 'RESPONDED';
ALTER TYPE "DisputeStatus" ADD VALUE IF NOT EXISTS 'ESCALATED';

ALTER TABLE "Dispute"
  ADD COLUMN IF NOT EXISTS "disputeNo" TEXT,
  ADD COLUMN IF NOT EXISTS "raisedByUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "raisedByOrgId" INTEGER,
  ADD COLUMN IF NOT EXISTS "againstOrgId" INTEGER,
  ADD COLUMN IF NOT EXISTS "buyerOrgId" INTEGER,
  ADD COLUMN IF NOT EXISTS "sellerOrgId" INTEGER,
  ADD COLUMN IF NOT EXISTS "linkedEntityType" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedEntityId" INTEGER,
  ADD COLUMN IF NOT EXISTS "invoiceId" INTEGER,
  ADD COLUMN IF NOT EXISTS "deliveryId" INTEGER,
  ADD COLUMN IF NOT EXISTS "grnId" INTEGER,
  ADD COLUMN IF NOT EXISTS "requirementResponseId" INTEGER,
  ADD COLUMN IF NOT EXISTS "auctionId" INTEGER,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "amountInDispute" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "priority" "DisputePriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "assignedAdminId" INTEGER,
  ADD COLUMN IF NOT EXISTS "adminRemarks" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Dispute_disputeNo_key" ON "Dispute"("disputeNo");
CREATE INDEX IF NOT EXISTS "Dispute_status_idx" ON "Dispute"("status");
CREATE INDEX IF NOT EXISTS "Dispute_raisedByOrgId_idx" ON "Dispute"("raisedByOrgId");
CREATE INDEX IF NOT EXISTS "Dispute_againstOrgId_idx" ON "Dispute"("againstOrgId");
CREATE INDEX IF NOT EXISTS "Dispute_assignedAdminId_idx" ON "Dispute"("assignedAdminId");
CREATE INDEX IF NOT EXISTS "Dispute_linkedEntityType_linkedEntityId_idx" ON "Dispute"("linkedEntityType", "linkedEntityId");
CREATE INDEX IF NOT EXISTS "Dispute_invoiceId_idx" ON "Dispute"("invoiceId");
CREATE INDEX IF NOT EXISTS "Dispute_deliveryId_idx" ON "Dispute"("deliveryId");
CREATE INDEX IF NOT EXISTS "Dispute_grnId_idx" ON "Dispute"("grnId");
CREATE INDEX IF NOT EXISTS "Dispute_requirementResponseId_idx" ON "Dispute"("requirementResponseId");
CREATE INDEX IF NOT EXISTS "Dispute_auctionId_idx" ON "Dispute"("auctionId");
CREATE INDEX IF NOT EXISTS "Dispute_createdAt_idx" ON "Dispute"("createdAt");

DO $$ BEGIN
  ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedByOrgId_fkey" FOREIGN KEY ("raisedByOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_againstOrgId_fkey" FOREIGN KEY ("againstOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_sellerOrgId_fkey" FOREIGN KEY ("sellerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "DisputeMessage"
  ADD COLUMN IF NOT EXISTS "senderOrgId" INTEGER,
  ADD COLUMN IF NOT EXISTS "message" TEXT,
  ADD COLUMN IF NOT EXISTS "visibility" "DisputeMessageVisibility" NOT NULL DEFAULT 'PUBLIC_TO_PARTIES';
CREATE INDEX IF NOT EXISTS "DisputeMessage_senderOrgId_idx" ON "DisputeMessage"("senderOrgId");
DO $$ BEGIN
  ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_senderOrgId_fkey" FOREIGN KEY ("senderOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DisputeAttachment" (
  "id" SERIAL PRIMARY KEY,
  "disputeId" INTEGER NOT NULL,
  "fileAssetId" INTEGER NOT NULL,
  "uploadedByUserId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeAttachment_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DisputeAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DisputeAttachment_disputeId_idx" ON "DisputeAttachment"("disputeId");
CREATE INDEX IF NOT EXISTS "DisputeAttachment_fileAssetId_idx" ON "DisputeAttachment"("fileAssetId");
CREATE INDEX IF NOT EXISTS "DisputeAttachment_uploadedByUserId_idx" ON "DisputeAttachment"("uploadedByUserId");

CREATE TABLE IF NOT EXISTS "OrgCustomRole" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "roleKey" TEXT NOT NULL,
  "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgCustomRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrgCustomRole_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgCustomRole_organizationId_roleKey_key" ON "OrgCustomRole"("organizationId", "roleKey");
CREATE INDEX IF NOT EXISTS "OrgCustomRole_organizationId_isActive_idx" ON "OrgCustomRole"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "OrgCustomRole_createdByUserId_idx" ON "OrgCustomRole"("createdByUserId");

CREATE TABLE IF NOT EXISTS "OrgRolePermission" (
  "id" SERIAL PRIMARY KEY,
  "roleId" INTEGER NOT NULL,
  "permissionKey" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "OrgCustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgRolePermission_roleId_permissionKey_key" ON "OrgRolePermission"("roleId", "permissionKey");
CREATE INDEX IF NOT EXISTS "OrgRolePermission_roleId_idx" ON "OrgRolePermission"("roleId");
CREATE INDEX IF NOT EXISTS "OrgRolePermission_permissionKey_idx" ON "OrgRolePermission"("permissionKey");

ALTER TABLE "OrgMembership"
  ADD COLUMN IF NOT EXISTS "customRoleId" INTEGER,
  ADD COLUMN IF NOT EXISTS "accessTransferredFromUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deactivatedByUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "deactivationReason" TEXT;
CREATE INDEX IF NOT EXISTS "OrgMembership_organizationId_customRoleId_idx" ON "OrgMembership"("organizationId", "customRoleId");
CREATE INDEX IF NOT EXISTS "OrgMembership_isActive_idx" ON "OrgMembership"("isActive");
CREATE INDEX IF NOT EXISTS "OrgMembership_deactivatedByUserId_idx" ON "OrgMembership"("deactivatedByUserId");
DO $$ BEGIN
  ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "OrgCustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_accessTransferredFromUserId_fkey" FOREIGN KEY ("accessTransferredFromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_deactivatedByUserId_fkey" FOREIGN KEY ("deactivatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "OrgInvitation"
  ADD COLUMN IF NOT EXISTS "invitedEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "customRoleId" INTEGER,
  ADD COLUMN IF NOT EXISTS "status" "OrgInvitationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "message" TEXT,
  ADD COLUMN IF NOT EXISTS "requiresPersonalVerification" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "OrgInvitation_organizationId_status_idx" ON "OrgInvitation"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "OrgInvitation_customRoleId_idx" ON "OrgInvitation"("customRoleId");
DO $$ BEGIN
  ALTER TABLE "OrgInvitation" ADD CONSTRAINT "OrgInvitation_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "OrgCustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AccessTransferLog" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "fromUserId" INTEGER NOT NULL,
  "toUserId" INTEGER,
  "toEmail" TEXT,
  "roleId" INTEGER,
  "performedByUserId" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "AccessTransferStatus" NOT NULL DEFAULT 'INITIATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AccessTransferLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccessTransferLog_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTransferLog_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AccessTransferLog_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "OrgCustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AccessTransferLog_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AccessTransferLog_organizationId_status_idx" ON "AccessTransferLog"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "AccessTransferLog_fromUserId_idx" ON "AccessTransferLog"("fromUserId");
CREATE INDEX IF NOT EXISTS "AccessTransferLog_toUserId_idx" ON "AccessTransferLog"("toUserId");
CREATE INDEX IF NOT EXISTS "AccessTransferLog_roleId_idx" ON "AccessTransferLog"("roleId");
CREATE INDEX IF NOT EXISTS "AccessTransferLog_performedByUserId_idx" ON "AccessTransferLog"("performedByUserId");
