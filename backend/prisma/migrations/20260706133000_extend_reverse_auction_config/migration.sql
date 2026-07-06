ALTER TABLE "Auction"
  ADD COLUMN IF NOT EXISTS "procurementMethod" TEXT DEFAULT 'REVERSE_AUCTION',
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "subCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "auctionType" TEXT DEFAULT 'ENGLISH_REVERSE',
  ADD COLUMN IF NOT EXISTS "auctionMode" TEXT DEFAULT 'ONLINE',
  ADD COLUMN IF NOT EXISTS "auctionDurationMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "purchaseGroup" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseOrganization" TEXT,
  ADD COLUMN IF NOT EXISTS "rankVisibility" TEXT DEFAULT 'SHOW_RANK_ONLY',
  ADD COLUMN IF NOT EXISTS "minimumQualifiedBidders" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "termsDocumentFileId" INTEGER,
  ADD COLUMN IF NOT EXISTS "termsDocumentName" TEXT,
  ADD COLUMN IF NOT EXISTS "buyerMonitorSettings" JSONB,
  ADD COLUMN IF NOT EXISTS "auctionConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "preBidStage" JSONB,
  ADD COLUMN IF NOT EXISTS "auctionTrigger" TEXT;

CREATE INDEX IF NOT EXISTS "Auction_procurementMethod_status_idx" ON "Auction"("procurementMethod", "status");
CREATE INDEX IF NOT EXISTS "Auction_rankVisibility_idx" ON "Auction"("rankVisibility");
