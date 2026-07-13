import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const bid = await db.procurementBid.findFirst({
    where: { OR: [{ id: 86 }, { bidNumber: '86' }] }
  });
  console.log('BID:', bid);
  
  const count = await db.procurementBid.count();
  console.log('TOTAL BIDS:', count);

  // Let's also find all bids to see if there is any bid with id 86 or similar
  const allBids = await db.procurementBid.findMany({
    select: { id: true, bidNumber: true, status: true }
  });
  console.log('ALL BIDS:', allBids);
}
main().catch(console.error).finally(() => db.$disconnect());
