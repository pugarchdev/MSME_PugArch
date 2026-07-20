const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const bid = await prisma.procurementBid.findFirst({
    where: {
      technicalPacket: { not: null }
    },
    orderBy: { id: 'desc' }
  });
  console.log(JSON.stringify(bid.technicalPacket, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
