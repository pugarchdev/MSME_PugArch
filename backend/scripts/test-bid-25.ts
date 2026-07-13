import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const bid = await prisma.procurementBid.findUnique({
    where: { id: 25 },
    include: { buyer: true }
  });
  console.log('BID 25:', JSON.stringify(bid, null, 2));
}
main();
