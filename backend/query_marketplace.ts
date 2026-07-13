import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const getPublicLegacyRequirementWhere = () => ({
    status: { in: ['APPROVED', 'SOURCING'] },
    AND: [{ OR: [{ requiredBy: null }, { requiredBy: { gte: new Date() } }] }]
});

async function main() {
  const legacyWhere = { ...getPublicLegacyRequirementWhere() };
  console.log("LEGACY WHERE QUERY:", JSON.stringify(legacyWhere, null, 2));

  const legacyRequirements = await db.requirement.findMany({
    where: legacyWhere,
    orderBy: [{ requiredBy: 'asc' }, { updatedAt: 'desc' }],
    include: {
      category: true,
      buyer: {
        select: {
          id: true,
          name: true,
          buyerProfile: { select: { organizationName: true, organizationType: true, city: true, district: true, state: true } }
        }
      },
      organization: true,
      items: true
    }
  });

  console.log(`FOUND ${legacyRequirements.length} LEGACY REQUIREMENTS IN DB:`);
  for (const reqItem of legacyRequirements) {
    const method = reqItem.canonicalMethod || reqItem.procurementMethod || '';
    const isRestricted = ['DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'REPEAT_ORDER', 'LIMITED_TENDER', 'SINGLE_SOURCE', 'PAC', 'EMERGENCY_PURCHASE'].includes(method.toUpperCase());
    const isLimitedRfq = method.toUpperCase() === 'RFQ' && reqItem.payload && typeof reqItem.payload === 'object' && (reqItem.payload as any).rfqType === 'LIMITED';
    
    console.log(`- ID: ${reqItem.id}, Number: ${reqItem.requirementNumber}, Status: ${reqItem.status}, method: ${method}, isRestricted: ${isRestricted}, isLimitedRfq: ${isLimitedRfq}`);
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
