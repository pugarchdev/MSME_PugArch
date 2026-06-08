import '../src/config/env.js';
import prisma from '../src/lib/prisma.js';

const seededUserEmails = [
  'admin@jsgsmile.com',
  'rajesh@texcorp.com',
  'suresh@buildcon.com',
  ...Array.from({ length: 10 }, (_, index) => `seller${index + 1}@gmail.com`),
  ...Array.from({ length: 10 }, (_, index) => `buyer${index + 1}@gmail.com`)
];

const seededUserIds = [
  ...Array.from({ length: 10 }, (_, index) => `SELLER_${index + 1}`),
  ...Array.from({ length: 10 }, (_, index) => `BUYER_${index + 1}`)
];

const seededOrganizationNames = Array.from(
  { length: 10 },
  (_, index) => `Seed Organization ${index + 1}`
);

const countDeleted = (result: { count: number }) => result.count;

async function main() {
  const summary = await prisma.$transaction(async (tx) => {
    const seedUsers = await tx.user.findMany({
      where: {
        OR: [
          { email: { in: seededUserEmails } },
          { userId: { in: seededUserIds } }
        ]
      },
      select: { id: true }
    });
    const userIds = seedUsers.map(user => user.id);

    const seedProducts = userIds.length > 0
      ? await tx.product.findMany({
          where: {
            sellerId: { in: userIds },
            OR: [
              { name: { startsWith: 'Seed Product ' } },
              { description: { startsWith: 'This is a properly seeded product for org ' } }
            ]
          },
          select: { id: true }
        })
      : [];
    const productIds = seedProducts.map(product => product.id);

    const seedServices = userIds.length > 0
      ? await tx.service.findMany({
          where: {
            sellerId: { in: userIds },
            OR: [
              { name: { startsWith: 'Seed Service ' } },
              { description: { startsWith: 'This is a properly seeded service for org ' } }
            ]
          },
          select: { id: true }
        })
      : [];
    const serviceIds = seedServices.map(service => service.id);

    const seedFileAssets = userIds.length > 0
      ? await tx.fileAsset.findMany({
          where: {
            ownerId: { in: userIds },
            OR: [
              { checksum: { startsWith: 'dummy-' } },
              { key: { startsWith: 'product_images/seed_' } },
              { key: { startsWith: 'product_docs/cert_' } },
              { key: { startsWith: 'service_docs/cert_' } }
            ]
          },
          select: { id: true }
        })
      : [];
    const fileAssetIds = seedFileAssets.map(asset => asset.id);

    const cartItems = productIds.length > 0 || serviceIds.length > 0
      ? await tx.cartItem.deleteMany({
          where: {
            OR: [
              productIds.length > 0 ? { productId: { in: productIds } } : {},
              serviceIds.length > 0 ? { serviceId: { in: serviceIds } } : {}
            ].filter(where => Object.keys(where).length > 0)
          }
        })
      : { count: 0 };

    const guestCartItems = productIds.length > 0 || serviceIds.length > 0
      ? await tx.guestCartItem.deleteMany({
          where: {
            OR: [
              productIds.length > 0 ? { productId: { in: productIds } } : {},
              serviceIds.length > 0 ? { serviceId: { in: serviceIds } } : {}
            ].filter(where => Object.keys(where).length > 0)
          }
        })
      : { count: 0 };

    const productImages = productIds.length > 0
      ? await tx.productImage.deleteMany({ where: { productId: { in: productIds } } })
      : { count: 0 };

    const certifications = productIds.length > 0 || serviceIds.length > 0 || fileAssetIds.length > 0
      ? await tx.certification.deleteMany({
          where: {
            OR: [
              productIds.length > 0 ? { productId: { in: productIds } } : {},
              serviceIds.length > 0 ? { serviceId: { in: serviceIds } } : {},
              fileAssetIds.length > 0 ? { fileAssetId: { in: fileAssetIds } } : {},
              { name: { startsWith: 'Product Certification ' } },
              { name: { startsWith: 'Service Certification ' } }
            ].filter(where => Object.keys(where).length > 0)
          }
        })
      : { count: 0 };

    const products = productIds.length > 0
      ? await tx.product.deleteMany({ where: { id: { in: productIds } } })
      : { count: 0 };

    const services = serviceIds.length > 0
      ? await tx.service.deleteMany({ where: { id: { in: serviceIds } } })
      : { count: 0 };

    const fileAssets = fileAssetIds.length > 0
      ? await tx.fileAsset.deleteMany({ where: { id: { in: fileAssetIds } } })
      : { count: 0 };

    const tenders = await tx.tender.deleteMany({
      where: {
        OR: [
          { tenderId: 'T-2026-0001' },
          { title: 'Office Furniture Supply', description: 'Need ergonomic chairs and desks.' }
        ]
      }
    });

    const protectedPurchaseOrderUsers = userIds.length > 0
      ? await tx.purchaseOrder.findMany({
          where: {
            OR: [
              { buyerId: { in: userIds } },
              { sellerId: { in: userIds } }
            ]
          },
          select: { buyerId: true, sellerId: true }
        })
      : [];
    const protectedUserIds = new Set<number>();
    for (const order of protectedPurchaseOrderUsers) {
      if (userIds.includes(order.buyerId)) protectedUserIds.add(order.buyerId);
      if (userIds.includes(order.sellerId)) protectedUserIds.add(order.sellerId);
    }

    const deletableUserIds = userIds.filter(id => !protectedUserIds.has(id));
    const suspendedUserIds = userIds.filter(id => protectedUserIds.has(id));

    const suspendedUsers = suspendedUserIds.length > 0
      ? await tx.user.updateMany({
          where: { id: { in: suspendedUserIds } },
          data: {
            accountStatus: 'SUSPENDED',
            lockedUntil: new Date('9999-12-31T00:00:00.000Z'),
            sessionVersion: { increment: 1 }
          }
        })
      : { count: 0 };

    const users = deletableUserIds.length > 0
      ? await tx.user.deleteMany({ where: { id: { in: deletableUserIds } } })
      : { count: 0 };

    const organizations = await tx.organization.deleteMany({
      where: { organizationName: { in: seededOrganizationNames } }
    });

    return {
      cartItems: countDeleted(cartItems),
      guestCartItems: countDeleted(guestCartItems),
      productImages: countDeleted(productImages),
      certifications: countDeleted(certifications),
      products: countDeleted(products),
      services: countDeleted(services),
      fileAssets: countDeleted(fileAssets),
      tenders: countDeleted(tenders),
      users: countDeleted(users),
      suspendedUsers: countDeleted(suspendedUsers),
      organizations: countDeleted(organizations)
    };
  }, { timeout: 60_000, maxWait: 60_000 });

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('Seed data cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
