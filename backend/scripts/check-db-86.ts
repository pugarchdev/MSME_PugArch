import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- ProcurementBid 86 ---');
  try {
    const pb = await prisma.procurementBid.findUnique({
      where: { id: 86 }
    });
    console.log(JSON.stringify(pb, null, 2));
  } catch (e: any) {
    console.error(e.message);
  }

  console.log('--- Tender 86 ---');
  try {
    const t = await prisma.tender.findUnique({
      where: { id: 86 }
    });
    console.log(JSON.stringify(t, null, 2));
  } catch (e: any) {
    console.error(e.message);
  }

  console.log('--- Requirement 86 ---');
  try {
    const r = await prisma.requirement.findUnique({
      where: { id: 86 }
    });
    console.log(JSON.stringify(r, null, 2));
  } catch (e: any) {
    console.error(e.message);
  }

  await prisma.$disconnect();
}

main();
