import { PrismaClient } from '@prisma/client';
import { decideApproval } from '../src/services/approval-chain.service.js';

const prisma = new PrismaClient();

async function main() {
  console.log('--- TEST DECIDE APPROVAL ---');
  try {
    const result = await decideApproval({
      approvalId: 2,
      decision: 'APPROVED',
      approverId: 4,
      approverOrgRole: 'ORG_ADMIN',
      organizationId: 2,
      remarks: 'Testing backend approval'
    });
    console.log('Approval succeeded!', result);
  } catch (err: any) {
    console.error('Approval failed with error:', err);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
