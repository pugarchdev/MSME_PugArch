import '../src/config/env.js';
import prisma from '../src/config/prisma.js';

async function main() {
  const users = await prisma.user.findMany({
    include: {
      organization: true
    }
  });

  console.log(`Total Users: ${users.length}`);
  for (const u of users) {
    const membership = u.organizationId ? await prisma.orgMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: u.id,
          organizationId: u.organizationId
        }
      }
    }) : null;

    console.log(`ID: ${u.id}, Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, Org ID: ${u.organizationId}, OrgRole: ${membership?.orgRole}, Active: ${membership?.isActive}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
