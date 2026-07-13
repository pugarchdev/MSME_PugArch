import './src/config/env.js';
import prisma from './src/lib/prisma.js';

async function main() {
  console.log("Truncating tables and cascading deletes to all dependent records...");
  
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Requirement" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "PurchaseOrder" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Invoice" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Tender" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "DirectPurchase" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Bid" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Cart" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Dispute" CASCADE;`);
  
  console.log("Cleanup complete!");
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
