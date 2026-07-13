const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

const companyListSelect = {
  id: true,
  name: true,
  shortName: true,
  portalDisplayName: true,
  contactEmail: true,
  contactPhone: true,
  district: true,
  state: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: true, organizations: true, features: true, buyerRequirements: true } }
};

async function main() {
  const deletedUsers = await prisma.user.findMany({
    where: {
      accountStatus: 'DELETED',
      NOT: {
        email: { startsWith: 'deleted_' }
      }
    }
  });

  console.log(`Found ${deletedUsers.length} deleted users needing credential release.`);

  for (const user of deletedUsers) {
    const timestamp = Date.now();
    const data = {};
    if (user.email && !user.email.startsWith('deleted_')) {
      data.email = `deleted_${timestamp}_${user.email}`;
    }
    if (user.userId && !user.userId.startsWith('deleted_')) {
      data.userId = `deleted_${timestamp}_${user.userId}`;
    }
    if (user.mobile && !user.mobile.startsWith('deleted_')) {
      data.mobile = `deleted_${timestamp}_${user.mobile}`;
    }

    await prisma.user.update({
      where: { id: user.id },
      data
    });
    console.log(`Updated credentials for user ID ${user.id} (${user.name})`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
