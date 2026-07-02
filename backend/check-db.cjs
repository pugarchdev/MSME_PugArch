const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const service = await prisma.service.findFirst();
  console.log("Service sample details:", JSON.stringify(service, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
