import '../src/config/env.js';
import prisma from '../src/lib/prisma.js';
import { numberSeries } from '../src/services/workflow/workflow-common.js';

async function main() {
  const email = 'snehalkolhe2628@gmail.com';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error('User not found');
    return;
  }
  console.log('User found:', user.email, 'Org ID:', user.organizationId);

  const orgId = user.organizationId;
  if (!orgId) {
    console.error('User has no organization');
    return;
  }

  // Find active cart
  let cart = await prisma.cart.findFirst({
    where: { organizationId: orgId, status: 'ACTIVE' },
    include: { items: true }
  });

  if (!cart || cart.items.length === 0) {
    console.log('No active cart found, creating a dummy one with a product...');
    const product = await prisma.product.findFirst({ where: { status: 'ACTIVE' } });
    if (!product) {
      console.error('No active products in catalog to create dummy cart');
      return;
    }
    // Create cart
    cart = await prisma.cart.create({
      data: {
        organizationId: orgId,
        buyerId: user.id,
        status: 'ACTIVE',
        items: {
          create: {
            productId: product.id,
            sellerId: product.sellerId,
            itemName: product.name,
            quantity: 1,
            unitOfMeasure: product.unitOfMeasure || 'units',
            unitPrice: product.price || 100,
          }
        }
      },
      include: { items: true }
    });
    console.log('Dummy cart created with item:', product.name);
  } else {
    console.log('Active cart found with', cart.items.length, 'items');
  }

  // Test the checkout logic in a transaction and rollback
  try {
    await prisma.$transaction(async (tx) => {
      console.log('Starting transaction simulation...');
      const buyerId = user.id;

      // Group items by sellerId
      const itemsBySeller: Record<number, typeof cart.items> = {};
      for (const item of cart.items) {
        if (!itemsBySeller[item.sellerId]) {
          itemsBySeller[item.sellerId] = [];
        }
        itemsBySeller[item.sellerId].push(item);
      }

      for (const [sellerIdStr, items] of Object.entries(itemsBySeller)) {
        const sellerId = parseInt(sellerIdStr, 10);
        let totalAmount = 0;
        const requirementItemsData: any[] = [];

        for (const item of items) {
          let unitPrice = 0;
          let taxRate = 0;
          let description = '';
          let specifications: any = null;
          let itemName = item.itemName;
          let unitOfMeasure = item.unitOfMeasure;

          if (item.productId) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
              include: { specifications: true }
            });
            if (!product || product.status !== 'ACTIVE') {
              throw new Error(`Product ${item.itemName} is not active or available.`);
            }
            unitPrice = Number(product.discountPrice || product.price || 0);
            taxRate = Number(product.taxRate || 0);
            description = product.description || '';
            specifications = product.specifications.map(s => ({ name: s.name, value: s.value, unit: s.unit }));
            itemName = product.name;
            unitOfMeasure = product.unitOfMeasure || 'units';
          } else if (item.serviceId) {
            const service = await tx.service.findUnique({
              where: { id: item.serviceId }
            });
            if (!service || service.status !== 'ACTIVE') {
              throw new Error(`Service ${item.itemName} is not active.`);
            }
            unitPrice = Number(service.discountPrice || service.basePrice || 0);
            taxRate = Number(service.taxRate || 0);
            description = service.description || '';
            itemName = service.name;
            unitOfMeasure = 'service';
          } else {
            throw new Error('Cart item must point to a product or service.');
          }

          const qty = Number(item.quantity);
          const itemTotalExclTax = qty * unitPrice;
          const itemTaxAmount = itemTotalExclTax * (taxRate / 100);
          totalAmount += (itemTotalExclTax + itemTaxAmount);

          requirementItemsData.push({
            productId: item.productId,
            itemName,
            description,
            quantity: item.quantity,
            unitOfMeasure,
            estimatedUnitPrice: unitPrice,
            specifications: specifications ? specifications : undefined
          });
        }

        console.log('Creating requirement...');
        const requirement = await tx.requirement.create({
          data: {
            requirementNumber: numberSeries('REQ'),
            buyerId,
            organizationId: orgId,
            title: `Direct Purchase Requirement for Seller #${sellerId}`,
            description: `Requirement automatically created for direct purchase checkout.`,
            procurementMethod: 'DIRECT_PURCHASE',
            status: 'SUBMITTED',
            estimatedValue: totalAmount,
            items: {
              create: requirementItemsData.map(item => ({
                productId: item.productId,
                itemName: item.itemName,
                description: item.description,
                quantity: item.quantity,
                unitOfMeasure: item.unitOfMeasure,
                estimatedUnitPrice: item.estimatedUnitPrice,
                specifications: item.specifications
              }))
            }
          }
        });
        console.log('Requirement created successfully:', requirement.id);

        console.log('Creating direct purchase...');
        const directPurchase = await tx.directPurchase.create({
          data: {
            requirementId: requirement.id,
            buyerId,
            sellerId,
            purchaseNumber: numberSeries('DP'),
            status: 'PENDING_APPROVAL',
            totalAmount,
            deliveryAddressId: null,
            deliveryAddressText: 'Test address text',
            department: 'Test Dept',
            budgetHead: 'Test Budget',
            costCenter: 'Test Cost Center',
            justification: 'Test Justification',
            remarks: null,
            deliveryInstructions: null,
            requiredDeliveryDate: null,
            approvalStatus: 'PENDING_APPROVAL',
            workflowStatus: 'PENDING_APPROVAL',
            approvedAt: null
          }
        });
        console.log('Direct purchase created successfully:', directPurchase.id);
      }

      throw new Error('ROLLBACK_INTENTIONAL'); // rollback transaction to not pollute DB
    }, { timeout: 30000 });
  } catch (err: any) {
    if (err.message === 'ROLLBACK_INTENTIONAL') {
      console.log('Transaction simulation succeeded! All operations are correct.');
    } else {
      console.error('Simulation failed with error:');
      console.error(err);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
