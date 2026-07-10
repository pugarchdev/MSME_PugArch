import '../src/config/env.js';
import prisma from '../src/lib/prisma.js';

async function main() {
  const dps = await prisma.directPurchase.findMany({
    include: {
      buyer: true,
      seller: true,
    }
  });

  console.log(`Total Direct Purchases: ${dps.length}`);
  for (const dp of dps) {
    console.log(`ID: ${dp.id}, Number: ${dp.purchaseNumber}, Buyer: ${dp.buyer?.email}, Seller: ${dp.seller?.email}, Status: ${dp.status}, WorkflowStatus: ${dp.workflowStatus}, TotalAmount: ${dp.totalAmount}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
