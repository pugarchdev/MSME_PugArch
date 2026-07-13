import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const reqs = await prisma.requirement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      category: true
    }
  });
  console.log("LAST 5 REQUIREMENTS:");
  console.log(JSON.stringify(reqs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
