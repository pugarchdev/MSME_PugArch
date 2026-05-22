import prisma from './config/prisma.js';

async function checkUsers() {
  const db = prisma as any;
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        onboardingStatus: true,
        createdAt: true
      }
    });
    console.log('Total users:', users.length);
    console.log(JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

checkUsers().then(() => process.exit(0));
