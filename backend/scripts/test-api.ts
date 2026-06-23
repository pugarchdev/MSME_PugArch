import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  console.log('--- ORGANIZATION 12 CHECK ---');
  const org12 = await db.organization.findUnique({
    where: { id: 12 },
    include: {
      profile: true,
      buyerProfiles: true,
      sellerProfiles: true
    }
  });
  console.dir(org12, { depth: null });

  console.log('\n--- ALL ORGANIZATIONS WITH PROFILES ---');
  const orgs = await db.organization.findMany({
    include: {
      profile: true
    }
  });
  for (const org of orgs) {
    console.log(`Org ID: ${org.id}, Name: ${org.organizationName}`);
    console.log(`- Profile:`, org.profile ? { logoUrl: org.profile.logoUrl, bannerUrl: (org.profile as any).bannerUrl } : null);
  }
}

main().catch(console.error).finally(() => db.$disconnect());
