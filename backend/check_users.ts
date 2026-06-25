import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const buyerId = 10; // Anand Milind Gadge

    // Find any 2 sellers in the database
    const sellers = await prisma.user.findMany({
      where: { role: 'seller' },
      take: 2
    });

    if (sellers.length < 2) {
      console.error('Error: Need at least 2 sellers in the database to seed mock bids!');
      return;
    }

    const seller1Id = sellers[0].id;
    const seller2Id = sellers[1].id;
    console.log(`Using Seller 1 (ID: ${seller1Id}, Name: ${sellers[0].name}) and Seller 2 (ID: ${seller2Id}, Name: ${sellers[1].name})`);

    console.log('Cleaning up existing mock tenders/bids...');
    await prisma.bid.deleteMany({
      where: {
        tender: {
          tenderId: { in: ['TND-2026-ANAND001', 'TND-2026-ANAND002', 'TND-2026-ANAND003'] }
        }
      }
    });
    await prisma.tender.deleteMany({
      where: {
        tenderId: { in: ['TND-2026-ANAND001', 'TND-2026-ANAND002', 'TND-2026-ANAND003'] }
      }
    });

    console.log('Seeding tenders and bids for Anand Milind Gadge...');

    // 1. Create a published tender
    const tender1 = await prisma.tender.create({
      data: {
        buyerId,
        tenderId: `TND-2026-ANAND001`,
        title: 'Office Stationery and IT Supply',
        category: 'Office Equipment',
        budget: 500000,
        description: 'Supply of high-quality office stationery, keyboards, mice, and basic IT supplies for local offices.',
        status: 'published',
        closesAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        quantityUnit: 'Nos',
        paymentTerms: 'PAID_ON_DELIVERY',
        deliveryType: 'DELIVERY_TO_OFFICE',
        bidsCount: 2,
      }
    });
    console.log(`Created Published Tender: ID=${tender1.id}`);

    // Create bids for this tender
    const bid1 = await prisma.bid.create({
      data: {
        tenderId: tender1.id,
        sellerId: seller1Id,
        unitPrice: 1000,
        quantity: 450,
        taxRate: 18,
        discountAmount: 0,
        subtotal: 450000,
        taxAmount: 81000,
        totalAmount: 531000,
        deliveryDays: 5,
        status: 'pending',
        bidNumber: 'BID-2026-MOCK001',
      }
    });
    console.log(`Created Bid 1: ID=${bid1.id} from Seller ID=${seller1Id}`);

    const bid2 = await prisma.bid.create({
      data: {
        tenderId: tender1.id,
        sellerId: seller2Id,
        unitPrice: 950,
        quantity: 450,
        taxRate: 18,
        discountAmount: 0,
        subtotal: 427500,
        taxAmount: 76950,
        totalAmount: 504450,
        deliveryDays: 7,
        status: 'pending',
        bidNumber: 'BID-2026-MOCK002',
      }
    });
    console.log(`Created Bid 2: ID=${bid2.id} from Seller ID=${seller2Id}`);

    // 2. Create a draft tender
    const tender2 = await prisma.tender.create({
      data: {
        buyerId,
        tenderId: `TND-2026-ANAND002`,
        title: 'Network Cabling Infrastructure',
        category: 'Networking',
        budget: 1500000,
        description: 'Draft plan for installing Cat6 network cabling in the main office building.',
        status: 'draft',
        closesAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        quantityUnit: 'Nos',
        paymentTerms: 'STAGE_PAYMENTS',
        deliveryType: 'ON_SITE_INSTALLATION',
        bidsCount: 0,
      }
    });
    console.log(`Created Draft Tender: ID=${tender2.id}`);

    // 3. Create a closed tender
    const tender3 = await prisma.tender.create({
      data: {
        buyerId,
        tenderId: `TND-2026-ANAND003`,
        title: 'Air Conditioning Maintenance',
        category: 'AMC Services',
        budget: 200000,
        description: 'Annual Maintenance Contract for office AC units.',
        status: 'closed',
        closesAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // closed 2 days ago
        quantityUnit: 'Nos',
        paymentTerms: 'QUARTERLY',
        deliveryType: 'SERVICE_AMC',
        bidsCount: 1,
      }
    });
    console.log(`Created Closed Tender: ID=${tender3.id}`);

    const bid3 = await prisma.bid.create({
      data: {
        tenderId: tender3.id,
        sellerId: seller1Id,
        unitPrice: 190000,
        quantity: 1,
        taxRate: 18,
        discountAmount: 0,
        subtotal: 190000,
        taxAmount: 34200,
        totalAmount: 224200,
        deliveryDays: 3,
        status: 'accepted',
        bidNumber: 'BID-2026-MOCK003',
      }
    });
    console.log(`Created Bid 3 (Accepted): ID=${bid3.id} from Seller ID=${seller1Id}`);

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
