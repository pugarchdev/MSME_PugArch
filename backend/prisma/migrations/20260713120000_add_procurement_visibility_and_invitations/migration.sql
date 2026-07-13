-- CreateEnum (idempotent: the shared dev DB may already have this type from a db push)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProcurementVisibility') THEN
    CREATE TYPE "ProcurementVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
  END IF;
END$$;

-- AlterTable: add visibility column (defaults to PUBLIC so existing rows keep current behaviour)
ALTER TABLE "ProcurementBid" ADD COLUMN IF NOT EXISTS "visibility" "ProcurementVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable: relational invitation records for private/limited procurements
CREATE TABLE IF NOT EXISTS "ProcurementBidInvitation" (
    "id" SERIAL NOT NULL,
    "bidId" INTEGER NOT NULL,
    "sellerOrgId" INTEGER,
    "sellerUserId" INTEGER,
    "invitedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementBidInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProcurementBidInvitation_bidId_sellerOrgId_key" ON "ProcurementBidInvitation"("bidId", "sellerOrgId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProcurementBidInvitation_bidId_sellerUserId_key" ON "ProcurementBidInvitation"("bidId", "sellerUserId");
CREATE INDEX IF NOT EXISTS "ProcurementBidInvitation_bidId_idx" ON "ProcurementBidInvitation"("bidId");
CREATE INDEX IF NOT EXISTS "ProcurementBidInvitation_sellerOrgId_idx" ON "ProcurementBidInvitation"("sellerOrgId");
CREATE INDEX IF NOT EXISTS "ProcurementBidInvitation_sellerUserId_idx" ON "ProcurementBidInvitation"("sellerUserId");
CREATE INDEX IF NOT EXISTS "ProcurementBid_visibility_status_idx" ON "ProcurementBid"("visibility", "status");

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcurementBidInvitation_bidId_fkey') THEN
    ALTER TABLE "ProcurementBidInvitation" ADD CONSTRAINT "ProcurementBidInvitation_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "ProcurementBid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- =============================================================================
-- Backfill: mark restricted-method or explicitly-limited bids as PRIVATE
-- =============================================================================
UPDATE "ProcurementBid"
SET "visibility" = 'PRIVATE'
WHERE "visibility" = 'PUBLIC'
  AND (
        UPPER(COALESCE("procurementType", '')) IN (
          'DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'REPEAT_ORDER', 'RATE_CONTRACT',
          'LIMITED_TENDER', 'SINGLE_SOURCE', 'PAC', 'EMERGENCY_PURCHASE'
        )
     OR UPPER(COALESCE("bidType", '')) IN (
          'DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'REPEAT_ORDER', 'RATE_CONTRACT',
          'LIMITED_TENDER', 'SINGLE_SOURCE', 'PAC', 'EMERGENCY_PURCHASE'
        )
     OR UPPER(COALESCE("technicalPacket"->'vendors'->>'selection', '')) IN ('SELECT', 'LIMITED')
      );

-- =============================================================================
-- Backfill invitations from technicalPacket JSON.
-- Handles invitedSellers[] and qualifiedVendors[] where each entry is either a
-- primitive id or an object carrying one of several id-bearing keys.
-- =============================================================================
INSERT INTO "ProcurementBidInvitation" ("bidId", "sellerOrgId", "createdAt")
SELECT DISTINCT b."id", v."orgId", CURRENT_TIMESTAMP
FROM "ProcurementBid" b
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN jsonb_typeof(elem) IN ('number', 'string') THEN elem #>> '{}'
    WHEN jsonb_typeof(elem) = 'object' THEN COALESCE(
      elem->>'sellerOrgId',
      elem->>'supplierId',
      elem->>'organizationId',
      elem->>'sellerUserId',
      elem->>'userId',
      elem->>'id'
    )
    ELSE NULL
  END AS raw
  FROM jsonb_array_elements(
    COALESCE(
      CASE WHEN jsonb_typeof(b."technicalPacket"->'vendors'->'invitedSellers') = 'array'
           THEN b."technicalPacket"->'vendors'->'invitedSellers' END,
      CASE WHEN jsonb_typeof(b."technicalPacket"->'qualifiedVendors') = 'array'
           THEN b."technicalPacket"->'qualifiedVendors' END,
      '[]'::jsonb
    )
  ) AS elem
) src
CROSS JOIN LATERAL (
  SELECT CASE WHEN src.raw ~ '^[0-9]+$' THEN src.raw::int ELSE NULL END AS "orgId"
) v
WHERE v."orgId" IS NOT NULL
ON CONFLICT ("bidId", "sellerOrgId") DO NOTHING;
