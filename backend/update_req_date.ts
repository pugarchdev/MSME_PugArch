import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  const req = await db.requirement.findFirst({
    where: { requirementNumber: "REQ-2026-2059AA44BC44" }
  });
  if (!req) {
    console.log("Requirement not found");
    return;
  }
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 30);
  
  await db.requirement.update({
    where: { id: req.id },
    data: { requiredBy: nextMonth }
  });
  console.log(`Successfully updated requiredBy for ${req.requirementNumber} to ${nextMonth.toISOString()}`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
