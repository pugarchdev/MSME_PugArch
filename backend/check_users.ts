import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        organization: {
          select: {
            organizationName: true
          }
        }
      }
    });
    console.log('USERS IN DB:');
    users.forEach(u => {
      console.log(`User: "${u.name}" (ID: ${u.id}, Role: ${u.role}) -> Org: "${u.organization?.organizationName || 'None'}" (ID: ${u.organizationId})`);
    });

  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
