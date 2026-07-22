import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  // Check bid REQ-2026-817B14FF6B8F participations and their documents
  const bid = await (db as any).procurementBid.findFirst({ 
    where: { bidNumber: 'REQ-2026-817B14FF6B8F' }, 
    include: { 
      participations: { 
        include: { 
          seller: true, 
          documents: true 
        } 
      } 
    } 
  });
  if (bid) {
    console.log('Found bid:', bid.id, bid.bidNumber, bid.title);
    console.log('Participations count:', bid.participations.length);
    for (const p of bid.participations) {
      console.log('\nParticipation #', p.id, 'seller:', p.seller?.name, 'financialStatus:', p.financialStatus, 'financialSealed:', p.financialSealed);
      console.log('  quotedAmount:', p.quotedAmount, 'totalAmount:', p.totalAmount);
      console.log('  Documents count:', p.documents?.length || 0);
      for (const d of (p.documents || [])) {
        console.log('    Doc:', d.id, d.documentName, 'fileUrl:', d.fileUrl ? 'present' : 'null');
      }
    }
  } else {
    console.log('Bid not found! Listing recent bids...');
    const bids = await (db as any).procurementBid.findMany({ take: 5, orderBy: { id: 'desc' } });
    for (const b of bids) { console.log(b.id, b.bidNumber, b.title); }
  }

  // Also check requirementResponses for this bid's shadow requirement
  const req = await (db as any).requirementResponse.findMany({ take: 10 });
  console.log('\nAll RequirementResponses count:', req.length);

  await db.$disconnect();
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
