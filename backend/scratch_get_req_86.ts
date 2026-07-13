import './src/config/env.js';
import prisma from './src/lib/prisma.js';

async function main() {
  const req = await prisma.requirement.findUnique({
    where: { id: 86 },
    include: {
      items: true,
      tenders: true,
      directPurchases: true,
    }
  });
  console.log("REQUIREMENT ID 86 DETAILS:");
  console.log(JSON.stringify(req, null, 2));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
