import './src/config/env.js';
import prisma from './src/lib/prisma.js';

async function main() {
  const users = await prisma.user.findMany({
    where: { id: { in: [6, 10] } },
    select: { id: true, email: true, role: true, sessionVersion: true, accountStatus: true }
  });
  console.log('USERS IN DATABASE:');
  for (const u of users) {
    console.log(`ID: ${u.id}, Email: ${u.email}, Role: ${u.role}, sessionVersion: ${u.sessionVersion}, Status: ${u.accountStatus}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
