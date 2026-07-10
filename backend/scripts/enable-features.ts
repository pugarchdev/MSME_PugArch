import '../src/config/env.js';
import prisma from '../src/lib/prisma.js';

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const features = await prisma.feature.findMany({ select: { id: true, name: true, code: true } });

  console.log(`Found ${companies.length} companies and ${features.length} features.`);

  if (companies.length === 0) {
    console.log('No companies found. Doing nothing.');
    await prisma.$disconnect();
    return;
  }

  let count = 0;
  for (const company of companies) {
    console.log(`Enabling all features for company: ${company.name} (ID: ${company.id})`);
    for (const feature of features) {
      await (prisma as any).companyFeature.upsert({
        where: {
          companyId_featureId: {
            companyId: company.id,
            featureId: feature.id
          }
        },
        update: {
          enabled: true
        },
        create: {
          companyId: company.id,
          featureId: feature.id,
          enabled: true
        }
      });
      count++;
    }
  }

  console.log(`Successfully upserted ${count} CompanyFeature relations as enabled.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Failed to enable features:', error);
  await prisma.$disconnect();
});
