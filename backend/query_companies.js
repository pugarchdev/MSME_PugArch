import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany();
  console.log('Companies:', companies);

  for (const company of companies) {
    const activeFeatures = await prisma.companyFeature.findMany({
      where: { companyId: company.id }
    });
    console.log(`Company: ${company.name} (ID: ${company.id}) has ${activeFeatures.length} feature records.`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
