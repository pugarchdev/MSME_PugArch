// One-off idempotent DDL for the reverse-auction pre-bid qualification stage.
// Deliberately NOT `prisma db push` — the shared dev DB may carry drift from
// other devs, and push would apply ALL of it. This touches one new table plus
// additive nullable columns on AuctionParticipant.
//
// Flow: seller uploads mandatory documents (+ an initial commercial quote for
// BID_WITH_REVERSE_AUCTION) -> submits for review -> buyer qualifies/disqualifies.
// Only participants promoted to TECHNICALLY_QUALIFIED may bid in the live auction.
import prisma from '../src/lib/prisma.js';

const statements = [
  // New columns on AuctionParticipant (all additive + nullable, safe to re-run).
  `ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "qualificationStatus"      TEXT DEFAULT 'PENDING';`,
  `ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "qualificationSubmittedAt" TIMESTAMP(3);`,
  `ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "qualifiedAt"              TIMESTAMP(3);`,
  `ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "qualificationRemarks"     TEXT;`,
  `ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "initialQuoteAmount"       DECIMAL(18,2);`,
  `ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "initialQuoteGstPercent"   DECIMAL(5,2);`,
  `ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "initialQuoteTotal"        DECIMAL(18,2);`,
  `ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "makeBrand"                TEXT;`,
  `ALTER TABLE "AuctionParticipant" ADD COLUMN IF NOT EXISTS "model"                    TEXT;`,

  // New qualification-document table.
  `CREATE TABLE IF NOT EXISTS "AuctionQualificationDocument" (
    "id"               SERIAL PRIMARY KEY,
    "auctionId"        INTEGER NOT NULL,
    "participantId"    INTEGER NOT NULL,
    "sellerOrgId"      INTEGER NOT NULL,
    "sellerUserId"     INTEGER,
    "documentCategory" TEXT NOT NULL DEFAULT 'TECHNICAL',
    "documentName"     TEXT NOT NULL,
    "fileAssetId"      INTEGER,
    "fileName"         TEXT,
    "fileUrl"          TEXT,
    "fileKey"          TEXT,
    "mimeType"         TEXT,
    "fileSize"         INTEGER,
    "uploadedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `DO $$ BEGIN
     ALTER TABLE "AuctionQualificationDocument"
       ADD CONSTRAINT "AuctionQualificationDocument_participantId_fkey"
       FOREIGN KEY ("participantId") REFERENCES "AuctionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `CREATE INDEX IF NOT EXISTS "AuctionQualificationDocument_auctionId_idx"     ON "AuctionQualificationDocument"("auctionId");`,
  `CREATE INDEX IF NOT EXISTS "AuctionQualificationDocument_participantId_idx" ON "AuctionQualificationDocument"("participantId");`,
  `CREATE INDEX IF NOT EXISTS "AuctionQualificationDocument_sellerOrgId_idx"   ON "AuctionQualificationDocument"("sellerOrgId");`
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  const participantCols = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'AuctionParticipant' AND column_name LIKE '%ualif%' OR column_name LIKE 'initialQuote%' ORDER BY column_name;`
  );
  const docCols = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'AuctionQualificationDocument' ORDER BY ordinal_position;`
  );
  console.log('AuctionParticipant qualification columns:', (participantCols as Array<{ column_name: string }>).map(c => c.column_name).join(', '));
  console.log('AuctionQualificationDocument columns:', (docCols as Array<{ column_name: string }>).map(c => c.column_name).join(', '));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('DDL failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
