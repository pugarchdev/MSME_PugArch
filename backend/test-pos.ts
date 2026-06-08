import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pos = await prisma.purchaseOrder.findMany({
    include: {
      buyer: { select: { name: true } },
      seller: { select: { name: true } }
    }
  });
  console.log("ALL POs:", JSON.stringify(pos, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
