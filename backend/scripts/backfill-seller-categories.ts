import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sampleCategoriesList = [
  ['IT Hardware', 'Software & Cloud'],
  ['Office Supplies', 'Furniture'],
  ['Industrial Equipment', 'Logistics'],
  ['Medical Supplies', 'Catering'],
  ['Construction', 'Consulting']
];

async function main() {
  console.log('--- Start Category Backfill ---');
  const profiles = await prisma.sellerProfile.findMany();
  console.log(`Found ${profiles.length} total seller profiles.`);

  let updatedCount = 0;
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    if (!profile.productCategories || profile.productCategories.length === 0) {
      const categories = sampleCategoriesList[i % sampleCategoriesList.length];
      await prisma.sellerProfile.update({
        where: { id: profile.id },
        data: { productCategories: categories }
      });
      console.log(`[BACKFILL] Updated Profile ID: ${profile.id} (${profile.businessName || 'Unnamed Business'}) with categories: ${categories.join(', ')}`);
      updatedCount++;
    } else {
      console.log(`[SKIP] Profile ID: ${profile.id} (${profile.businessName || 'Unnamed Business'}) already has categories: ${profile.productCategories.join(', ')}`);
    }
  }

  console.log(`--- Finished. Updated ${updatedCount} profiles. ---`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
