import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- REVERSE AUCTION QUALIFICATION DIAGNOSTIC ---');

  const total = await prisma.auction.count();
  console.log(`\nTotal auctions: ${total}`);

  const byMethod = await prisma.auction.groupBy({ by: ['procurementMethod'], _count: { _all: true } });
  console.log('By procurementMethod:', byMethod.map(r => `${r.procurementMethod}=${r._count._all}`).join(', '));

  const byVis = await prisma.auction.groupBy({ by: ['visibilityMode'], _count: { _all: true } });
  console.log('By visibilityMode:', byVis.map(r => `${r.visibilityMode}=${r._count._all}`).join(', '));

  const partByStatus = await prisma.auctionParticipant.groupBy({ by: ['status'], _count: { _all: true } });
  console.log('\nAuctionParticipant by status:', partByStatus.map(r => `${r.status}=${r._count._all}`).join(', '));

  // Hybrid auctions: inspect preBidStage + participant statuses
  const hybrids = await prisma.auction.findMany({
    where: { procurementMethod: 'BID_WITH_REVERSE_AUCTION' },
    take: 10,
    select: { id: true, title: true, status: true, statusEnum: true, visibilityMode: true, auctionTrigger: true, preBidStage: true }
  });
  console.log(`\nBID_WITH_REVERSE_AUCTION auctions: ${hybrids.length}`);
  for (const a of hybrids) {
    const parts = await prisma.auctionParticipant.groupBy({ by: ['status'], where: { auctionId: a.id }, _count: { _all: true } });
    console.log(`- Auction ${a.id} "${a.title}" status=${a.status}/${a.statusEnum} trigger=${a.auctionTrigger}`);
    console.log(`    preBidStage=${JSON.stringify(a.preBidStage)}`);
    console.log(`    participants: ${parts.map(p => `${p.status}=${p._count._all}`).join(', ') || 'NONE'}`);
  }

  // Does an auction participant carry any document / initial-quote fields?
  const sampleParticipant = await prisma.auctionParticipant.findFirst();
  console.log('\nSample AuctionParticipant fields:', sampleParticipant ? Object.keys(sampleParticipant).join(', ') : 'no rows');

  // Any linkage between auctions and procurement bids / requirements?
  const withReq = await prisma.auction.findFirst({ where: { requirementId: { not: null } }, select: { id: true, requirementId: true } }).catch(() => null);
  console.log('\nAuction linked to requirement sample:', withReq ? JSON.stringify(withReq) : 'none / no requirementId column');
}

main().catch(e => console.error('ERR', e?.message || e)).finally(() => prisma.$disconnect());
