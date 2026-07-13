import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const profiles = await prisma.buyerProfile.findMany({
      select: {
        id: true,
        organizationName: true,
        logoUrl: true,
        bannerUrl: true,
        organizationId: true
      }
    });
    console.log("=== BUYER PROFILES LOGO & BANNER ===");
    profiles.forEach(p => {
      console.log(`Profile ID: ${p.id} ("${p.organizationName}"):
  logoUrl: ${JSON.stringify(p.logoUrl)}
  bannerUrl: ${JSON.stringify(p.bannerUrl)}
  organizationId: ${p.organizationId}`);
    });

    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        organizationName: true,
        logoFile: {
          select: {
            url: true
          }
        },
        profile: {
          select: {
            logoUrl: true,
            bannerUrl: true
          }
        }
      }
    });
    console.log("=== ORGANIZATIONS LOGO & BANNER ===");
    orgs.forEach(o => {
      console.log(`Org ID: ${o.id} ("${o.organizationName}"):
  logoFile.url: ${JSON.stringify(o.logoFile?.url)}
  profile.logoUrl: ${JSON.stringify(o.profile?.logoUrl)}
  profile.bannerUrl: ${JSON.stringify(o.profile?.bannerUrl)}`);
    });
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
