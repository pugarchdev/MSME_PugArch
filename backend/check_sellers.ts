import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        sellerId: true,
        status: true,
        seller: {
          select: {
            name: true
          }
        }
      }
    });
    console.log('PRODUCTS BY SELLER:');
    products.forEach(p => {
      console.log(`Product: "${p.name}" (ID: ${p.id}, Status: ${p.status}) -> Seller: "${p.seller?.name}" (ID: ${p.sellerId})`);
    });

    const services = await prisma.service.findMany({
      select: {
        id: true,
        name: true,
        sellerId: true,
        status: true,
        seller: {
          select: {
            name: true
          }
        }
      }
    });
    console.log('\nSERVICES BY SELLER:');
    services.forEach(s => {
      console.log(`Service: "${s.name}" (ID: ${s.id}, Status: ${s.status}) -> Seller: "${s.seller?.name}" (ID: ${s.sellerId})`);
    });

  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
