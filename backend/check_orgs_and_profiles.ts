import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const orgs = await prisma.organization.findMany({
      include: {
        buyerProfiles: true
      }
    });
    console.log(`TOTAL ORGANIZATIONS: ${orgs.length}`);
    orgs.forEach(org => {
      console.log(`Org ID: ${org.id}
  Name: "${org.organizationName}"
  VerificationStatus: "${org.verificationStatus}"
  Buyer Profiles count: ${org.buyerProfiles.length}`);
      org.buyerProfiles.forEach(bp => {
        console.log(`    - Profile ID: ${bp.id}, Name: "${bp.organizationName}", VerificationStatus: "${bp.verificationStatus}"`);
      });
    });
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
