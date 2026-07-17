-- Reverse auction pre-bid qualification stage.
-- Idempotent because shared/dev databases may already have been repaired by
-- scripts/create-auction-qualification-table.ts.

ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "qualificationStatus" TEXT DEFAULT 'PENDING';
ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "qualificationSubmittedAt" TIMESTAMP(3);
ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "qualifiedAt" TIMESTAMP(3);
ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "qualificationRemarks" TEXT;
ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "initialQuoteAmount" DECIMAL(18,2);
ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "initialQuoteGstPercent" DECIMAL(5,2);
ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "initialQuoteTotal" DECIMAL(18,2);
ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "makeBrand" TEXT;
ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "model" TEXT;

CREATE TABLE IF NOT EXISTS "AuctionQualificationDocument" (
  "id" SERIAL PRIMARY KEY,
  "auctionId" INTEGER NOT NULL,
  "participantId" INTEGER NOT NULL,
  "sellerOrgId" INTEGER NOT NULL,
  "sellerUserId" INTEGER,
  "documentCategory" TEXT NOT NULL DEFAULT 'TECHNICAL',
  "documentName" TEXT NOT NULL,
  "fileAssetId" INTEGER,
  "fileName" TEXT,
  "fileUrl" TEXT,
  "fileKey" TEXT,
  "mimeType" TEXT,
  "fileSize" INTEGER,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AuctionQualificationDocument_participantId_fkey'
  ) THEN
    ALTER TABLE "AuctionQualificationDocument"
      ADD CONSTRAINT "AuctionQualificationDocument_participantId_fkey"
      FOREIGN KEY ("participantId") REFERENCES "AuctionParticipant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "AuctionQualificationDocument_auctionId_idx" ON "AuctionQualificationDocument"("auctionId");
CREATE INDEX IF NOT EXISTS "AuctionQualificationDocument_participantId_idx" ON "AuctionQualificationDocument"("participantId");
CREATE INDEX IF NOT EXISTS "AuctionQualificationDocument_sellerOrgId_idx" ON "AuctionQualificationDocument"("sellerOrgId");
