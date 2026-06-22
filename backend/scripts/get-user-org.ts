import '../src/config/env.js';
import prisma from '../src/config/prisma.js';

async function main() {
  const email = 'snehalkolhe2628@gmail.com';
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      organization: true
    }
  });

  if (!user) {
    console.error('User not found');
    return;
  }

  console.log('User ID:', user.id, 'Role:', user.role, 'Org ID:', user.organizationId);
  if (user.organizationId) {
    const membership = await prisma.orgMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: user.organizationId
        }
      }
    });
    console.log('Membership Role:', membership?.orgRole, 'Is Active:', membership?.isActive);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
