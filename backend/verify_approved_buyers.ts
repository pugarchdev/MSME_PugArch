import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const approvedBuyers = await prisma.user.findMany({
      where: {
        role: 'buyer',
        onboardingStatus: 'approved_for_procurement'
      },
      include: {
        buyerProfile: true
      }
    });

    console.log(`Found ${approvedBuyers.length} approved buyers in the database.`);

    let updatedCount = 0;
    for (const user of approvedBuyers) {
      if (user.buyerProfile && user.buyerProfile.verificationStatus !== 'VERIFIED') {
        console.log(`Updating showcase verification status to VERIFIED for: "${user.buyerProfile.organizationName}" (User ID: ${user.id})`);
        await prisma.buyerProfile.update({
          where: { id: user.buyerProfile.id },
          data: {
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date(),
            verifiedBy: 'System Auto-Fix'
          }
        });
        updatedCount++;
      }
    }
    console.log(`Successfully verified ${updatedCount} buyer showcase profiles.`);
  } catch (error) {
    console.error('Error during verification update:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
