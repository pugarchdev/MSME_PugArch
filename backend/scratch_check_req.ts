import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const legacyReq = await prisma.requirement.findUnique({
    where: { id: 12 },
    include: {
      organization: true,
      buyer: true
    }
  }).catch(() => null);
  console.log('--- Legacy Requirement 12 ---');
  console.log(JSON.stringify(legacyReq, null, 2));

  const allLegacyReqs = await prisma.requirement.findMany({
    select: { id: true, title: true, status: true, requiredBy: true }
  }).catch(() => []);
  console.log('--- All Legacy Requirements ---');
  console.log(JSON.stringify(allLegacyReqs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
