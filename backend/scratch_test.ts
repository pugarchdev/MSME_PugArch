import './src/config/env.js';
import prisma from './src/config/prisma.js';

async function main() {
  const sessions = await prisma.preRegistrationKycSession.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15
  });
  console.log(`Found ${sessions.length} pre-registration sessions:`);
  for (const s of sessions) {
    console.log(`ID: ${s.id}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  State: ${s.state}`);
    console.log(`  Verified Name: ${s.verifiedName}`);
    console.log(`  Created At: ${s.createdAt}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
