// One-off idempotent DDL: creates the RequirementClarification table only.
// Deliberately NOT `prisma db push` — the shared dev DB may carry drift from
// other devs, and push would apply ALL of it. This touches one new table.
// Polymorphic Q&A thread: entityType 'REQUIREMENT' (BuyerRequirement.id) or 'AUCTION' (Auction.id).
import prisma from '../src/lib/prisma.js';

const statements = [
  `CREATE TABLE IF NOT EXISTS "RequirementClarification" (
    "id"           SERIAL PRIMARY KEY,
    "entityType"   TEXT NOT NULL DEFAULT 'REQUIREMENT',
    "entityId"     INTEGER NOT NULL,
    "question"     TEXT NOT NULL,
    "response"     TEXT,
    "visibility"   TEXT NOT NULL DEFAULT 'PUBLIC',
    "askedById"    INTEGER NOT NULL,
    "answeredById" INTEGER,
    "askedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `DO $$ BEGIN
     ALTER TABLE "RequirementClarification"
       ADD CONSTRAINT "RequirementClarification_askedById_fkey"
       FOREIGN KEY ("askedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
     ALTER TABLE "RequirementClarification"
       ADD CONSTRAINT "RequirementClarification_answeredById_fkey"
       FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `CREATE INDEX IF NOT EXISTS "RequirementClarification_entityType_entityId_visibility_idx" ON "RequirementClarification"("entityType", "entityId", "visibility");`,
  `CREATE INDEX IF NOT EXISTS "RequirementClarification_askedById_idx" ON "RequirementClarification"("askedById");`
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  const check = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'RequirementClarification' ORDER BY ordinal_position;`
  );
  console.log('RequirementClarification columns:', (check as Array<{ column_name: string }>).map(c => c.column_name).join(', '));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('DDL failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
