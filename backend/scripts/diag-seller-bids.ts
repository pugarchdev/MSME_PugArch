import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- SELLER BIDS / AWARDS DIAGNOSTIC ---');

  const partTotal = await prisma.procurementBidParticipation.count();
  console.log(`\nTotal ProcurementBidParticipation rows: ${partTotal}`);

  const byStatus = await prisma.procurementBidParticipation.groupBy({
    by: ['submissionStatus'],
    _count: { _all: true }
  });
  console.log('By submissionStatus:', byStatus.map(r => `${r.submissionStatus}=${r._count._all}`).join(', '));

  const byFinal = await prisma.procurementBidParticipation.groupBy({
    by: ['finalStatus'],
    _count: { _all: true }
  });
  console.log('By finalStatus:', byFinal.map(r => `${r.finalStatus}=${r._count._all}`).join(', '));

  const awardTotal = await prisma.procurementBidAward.count();
  console.log(`\nTotal ProcurementBidAward rows: ${awardTotal}`);
  const awards = await prisma.procurementBidAward.findMany({
    take: 10,
    include: { participation: { select: { id: true, sellerId: true, submissionStatus: true, finalStatus: true } }, bid: { select: { id: true, title: true, status: true } } }
  });
  for (const a of awards) {
    console.log(`- Award ${a.id}: bid=${a.bidId} "${a.bid?.title}" status=${a.bid?.status}, participation=${a.participationId} sellerId=${a.sellerId} awardStatus=${a.awardStatus} awardedAt=${a.awardedAt}`);
    console.log(`    participation.submissionStatus=${a.participation?.submissionStatus} finalStatus=${a.participation?.finalStatus}`);
  }

  // Per-seller breakdown for sellers that have participations
  const sellers = await prisma.procurementBidParticipation.groupBy({
    by: ['sellerId'],
    _count: { _all: true }
  });
  console.log(`\nSellers with participations: ${sellers.length}`);
  for (const s of sellers.slice(0, 15)) {
    const drafts = await prisma.procurementBidParticipation.count({ where: { sellerId: s.sellerId, submissionStatus: 'DRAFT' } });
    const submitted = await prisma.procurementBidParticipation.count({ where: { sellerId: s.sellerId, submissionStatus: 'SUBMITTED' } });
    const awarded = await prisma.procurementBidAward.count({ where: { sellerId: s.sellerId } });
    const finalAwarded = await prisma.procurementBidParticipation.count({ where: { sellerId: s.sellerId, finalStatus: 'AWARDED' } });
    const u = await prisma.user.findUnique({ where: { id: s.sellerId }, select: { name: true, organizationId: true } });
    console.log(`- sellerId=${s.sellerId} (${u?.name}, org=${u?.organizationId}) total=${s._count._all} draft=${drafts} submitted=${submitted} awardRows=${awarded} finalAwarded=${finalAwarded}`);
  }

  // Invitations
  const invTotal = await prisma.procurementBidInvitation.count();
  console.log(`\nTotal ProcurementBidInvitation rows: ${invTotal}`);
  const invByBid = await prisma.procurementBidInvitation.findMany({ take: 15, select: { bidId: true, sellerOrgId: true, sellerUserId: true } });
  for (const iv of invByBid) console.log(`- inv: bid=${iv.bidId} sellerOrgId=${iv.sellerOrgId} sellerUserId=${iv.sellerUserId}`);

  // Private/restricted bids
  const restrictedMethods = ['LIMITED_TENDER', 'REPEAT_ORDER', 'RATE_CONTRACT'];
  const privateBids = await prisma.procurementBid.count({
    where: { OR: [{ visibility: 'PRIVATE' }, { procurementType: { in: restrictedMethods } }, { bidType: { in: restrictedMethods } }] }
  });
  console.log(`\nPrivate/restricted ProcurementBid count: ${privateBids}`);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
