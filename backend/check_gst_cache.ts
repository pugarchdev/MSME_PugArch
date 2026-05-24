import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const cached = await prisma.gstCache.findUnique({
      where: { gstNumber: '27NIPPL3456D1ZW' }
    });
    console.log('Cached GST details:', JSON.stringify(cached, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
