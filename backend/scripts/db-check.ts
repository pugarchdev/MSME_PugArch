import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- DIAGNOSTIC DB CHECK ---');
  
  // 1. Find Anand Buyer
  const user = await prisma.user.findFirst({
    where: { name: { contains: 'Anand Buyer', mode: 'insensitive' } },
    include: {
      organization: true
    }
  });
  
  if (!user) {
    console.log('User "Anand Buyer" not found.');
    return;
  }
  
  console.log(`User found: ${user.name} (ID: ${user.id}, Email: ${user.email})`);
  console.log(`Platform Role: ${user.role}`);
  console.log(`Organization: ${user.organization?.organizationName || 'None'} (ID: ${user.organizationId})`);
  
  if (user.organizationId) {
    // 2. Check Org Membership and role
    const membership = await prisma.orgMembership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: user.organizationId } }
    });
    console.log(`Org Role: ${membership?.orgRole || 'None'} (Active: ${membership?.isActive})`);
    
    // 3. Check Carts in this Org
    const carts = await prisma.cart.findMany({
      where: { organizationId: user.organizationId },
      include: {
        items: true,
        createdBy: { select: { name: true } }
      }
    });
    console.log(`Carts count in Org: ${carts.length}`);
    for (const c of carts) {
      console.log(`- Cart ID: ${c.id}, Status: ${c.status}, Created By: ${c.createdBy.name}, Items: ${c.items.length}`);
      
      // Check if there are approvals for this cart
      const approvals = await prisma.procurementApproval.findMany({
        where: { entityType: 'cart', entityId: c.id }
      });
      console.log(`  Approval stages count: ${approvals.length}`);
      for (const a of approvals) {
        console.log(`    ID: ${a.id}, Stage: ${a.stage}, Sequence: ${a.sequence}, Decision: ${a.decision}, Approver ID: ${a.approverId || 'None'}`);
      }
    }
    
    // 4. Check all pending approvals in the Org
    const allPending = await prisma.procurementApproval.findMany({
      where: { organizationId: user.organizationId, decision: 'PENDING' }
    });
    console.log(`Total Pending Approvals in Org: ${allPending.length}`);
    for (const ap of allPending) {
      console.log(`- Type: ${ap.entityType}, ID: ${ap.entityId}, Stage: ${ap.stage}, Seq: ${ap.sequence}`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
