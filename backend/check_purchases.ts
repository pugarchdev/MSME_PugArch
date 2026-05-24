import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const buyers = await prisma.user.findMany({
      where: { role: 'buyer' }
    });
    console.log('Buyers:', buyers.map(b => ({ id: b.id, name: b.name, email: b.email })));

    const purchases = await prisma.directPurchase.findMany({
      include: {
        buyer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } }
      }
    });
    console.log('Direct Purchases:', JSON.stringify(purchases, null, 2));

    const rfqs = await prisma.quoteRequest.findMany({
      include: {
        buyer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } }
      }
    });
    console.log('Quote Requests:', JSON.stringify(rfqs, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
