import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const profiles = await prisma.buyerProfile.findMany({
      include: {
        user: {
          select: {
            name: true,
            email: true,
            onboardingStatus: true,
          }
        }
      }
    });
    console.log('BUYER PROFILES IN DB:');
    profiles.forEach(p => {
      console.log(`Profile ID: ${p.id}
  User: "${p.user?.name}" (ID: ${p.userId}, Email: ${p.user?.email})
  Org Name: "${p.organizationName}"
  OnboardingStatus: "${p.user?.onboardingStatus}"
  VerificationStatus: "${p.verificationStatus}"
  IsActive: ${p.isActive}
  VerifiedAt: ${p.verifiedAt}
  VerifiedBy: "${p.verifiedBy}"`);
    });

  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
