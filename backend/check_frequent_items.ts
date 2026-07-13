import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const items = await prisma.buyerFrequentlyBoughtItem.findMany();
    console.log(`TOTAL FREQUENTLY BOUGHT ITEMS: ${items.length}`);
    items.forEach(item => {
      console.log(`Item ID: ${item.id}
  buyerId: ${item.buyerId}
  organizationProfileId: ${item.organizationProfileId}
  serialNo: "${item.serialNo}"
  description: "${item.itemDescription}"
  category: "${item.category}"
  monthlyRequirement: "${item.estimatedMonthlyRequirement}"
  unit: "${item.unit}"
  status: "${item.status}"`);
    });
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
