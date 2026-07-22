const { PrismaClient } = require('@prisma/client');
const { getSignedUrl } = require('./dist/src/services/storage/storage.service.js');
const prisma = new PrismaClient();

async function main() {
  const seller = await prisma.user.findFirst({
    where: { role: 'seller' }
  });
  console.log("SELLER:", seller?.id, seller?.email);
  if (seller) {
    try {
      const res = await getSignedUrl(69, { id: seller.id, role: 'seller' });
      console.log("SIGNED URL RESULT:", res);
    } catch (err) {
      console.error("ERROR IN GETSIGNEDURL:", err);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
