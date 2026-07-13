import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const req = await db.requirement.findUnique({
    where: { id: 86 },
    include: { tenders: true, directPurchases: true }
  });
  console.log('REQUIREMENT 86:', req);

  // Let's also check all requirements in the database to see what we have
  const allReqs = await db.requirement.findMany({
    select: { id: true, title: true, status: true, canonicalMethod: true }
  });
  console.log('ALL REQUIREMENTS:', allReqs);
}
main().catch(console.error).finally(() => db.$disconnect());
