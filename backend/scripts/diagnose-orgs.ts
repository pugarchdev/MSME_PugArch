import '../src/config/env.js';
import prisma from '../src/config/prisma.js';

async function main() {
  console.log('--- ADMIN USER DIAGNOSTIC ---');
  const adminUser = await prisma.user.findUnique({
    where: { id: 7 },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
      onboardingStatus: true,
    }
  });
  console.log('Admin User:', adminUser);

  console.log('--- ALL ORGANIZATIONS ---');
  const orgs = await prisma.organization.findMany({
    include: {
      users: { select: { id: true, name: true, email: true, role: true } },
      buyerProfiles: { select: { id: true, organizationName: true, verificationStatus: true } },
      sellerProfiles: { select: { id: true, businessName: true, verificationStatusEnum: true } },
    }
  });
  console.log('Organizations:', JSON.stringify(orgs, null, 2));

  console.log('--- ALL COMPANIES ---');
  const companies = await prisma.company.findMany();
  console.log('Companies:', companies);

  await prisma.$disconnect();
}

main().catch(console.error);
