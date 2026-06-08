import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = 16;
  const role = 'buyer';

  let where: any = role === 'admin'
      ? {}
      : role === 'buyer'
        ? { buyerId: userId }
        : { sellerId: userId };

  where.status = { in: ['generated', 'accepted', 'in_fulfillment', 'delivered', 'invoice_submitted'] };

  const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        tender: { select: { id: true, tenderId: true, title: true, category: true, status: true } },
        deliveryWorkflow: true,
        inspectionRecord: true,
        invoices: { orderBy: { createdAt: 'desc' } },
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 10
  });

  console.log("Filtered POs count:", purchaseOrders.length);
  purchaseOrders.forEach(po => console.log(po.poNumber, po.title));
}

main().catch(console.error).finally(() => prisma.$disconnect());
