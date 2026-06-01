import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Testing Guest Cart addition via findFirst + create/update...');
  try {
    const cartToken = 'test_token_123456789';
    const cart = await prisma.guestCart.upsert({
      where: { cartToken },
      update: {},
      create: { cartToken }
    });
    console.log('Guest cart:', cart);

    const product = await prisma.product.findFirst({
      where: { status: 'ACTIVE' }
    });
    if (!product) {
      console.log('No active product found.');
      return;
    }
    console.log('Using product:', product.name, '(ID:', product.id, ')');

    // 1. Find existing
    const existing = await (prisma as any).guestCartItem.findFirst({
      where: {
        guestCartId: cart.id,
        itemType: 'PRODUCT',
        productId: product.id,
        serviceId: null
      }
    });

    let item;
    if (existing) {
      console.log('Found existing item, updating...');
      item = await (prisma as any).guestCartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + 1 }
      });
    } else {
      console.log('Creating new item...');
      item = await (prisma as any).guestCartItem.create({
        data: {
          guestCartId: cart.id,
          itemType: 'PRODUCT',
          productId: product.id,
          serviceId: null,
          quantity: 1,
          priceSnapshot: product.price,
          sellerOrganizationId: product.organizationId
        }
      });
    }
    console.log('Operation succeeded. Result:', item);
  } catch (err: any) {
    console.error('Operation failed with error:', err.message || err);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
