import './src/config/env.js';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function go() {
  console.log('Seeding mock bidding opportunities...');
  
  // Clean up any previously seeded mock opportunities to maintain idempotency
  await db.procurementBid.deleteMany({
    where: { description: { startsWith: '[MOCK]' } }
  });
  await db.buyerRequirement.deleteMany({
    where: { description: { startsWith: '[MOCK]' } }
  });
  await db.quoteRequest.deleteMany({
    where: { message: { startsWith: '[MOCK]' } }
  });
  await db.auction.deleteMany({
    where: { description: { startsWith: '[MOCK]' } }
  });

  const now = new Date();
  const futureDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days in the future

  // 1. Seed ProcurementBid (Large Procurement)
  const procBid = await db.procurementBid.create({
    data: {
      bidNumber: 'BID-2026-MOCK101',
      title: 'Procurement of Electrical Wiring & Cabling',
      description: '[MOCK] Supply of heavy-duty flame-retardant industrial cables for municipal infrastructure upgrade.',
      buyerId: 6,
      buyerOrganizationId: 1,
      buyerOrganizationName: 'PUGARCH TECHNOLOGY PRIVATE LIMITED',
      buyerType: 'GOVERNMENT',
      category: 'Electrical & Electronics',
      bidType: 'OPEN',
      procurementType: 'OPEN_TENDER',
      canonicalMethod: 'OPEN_TENDER',
      quantity: 500,
      unit: 'meters',
      estimatedValue: 150000.00,
      deliveryLocation: 'Nagpur, Maharashtra',
      state: 'Maharashtra',
      district: 'Nagpur',
      pincode: '440034',
      startDate: now,
      endDate: futureDate,
      status: 'OPEN',
      approvalStatus: 'APPROVED',
      lifecycleStage: 'BID_PUBLISHED'
    }
  });
  console.log('Seeded ProcurementBid:', procBid.bidNumber);

  // 2. Seed BuyerRequirement (Buyer Requirement)
  const buyerReq = await db.buyerRequirement.create({
    data: {
      buyerOrganizationId: 1,
      title: 'Requirement for Industrial Electric Switches',
      description: '[MOCK] Sourcing high-durability switches for distribution board assembly.',
      requirementType: 'PRODUCT',
      categoryId: 1,
      quantity: 120,
      unit: 'pieces',
      location: 'Nagpur, Maharashtra',
      budgetMin: 30000.00,
      budgetMax: 45000.00,
      lastDate: futureDate,
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
      isFeatured: true,
      isUrgent: false,
      createdById: 6,
      approvedById: 8,
      approvedAt: now
    }
  });
  console.log('Seeded BuyerRequirement:', buyerReq.title);

  // 3. Seed QuoteRequest (Quick Quote)
  const quoteReq = await db.quoteRequest.create({
    data: {
      buyerId: 6,
      sellerId: 5,
      subject: 'Urgent Quotation for Electric Meters',
      message: '[MOCK] Requesting bulk quote for 3-phase digital meters with ISI mark.',
      estimatedValue: 65000.00,
      deadlineDate: futureDate,
      status: 'pending',
      statusEnum: 'SENT'
    }
  });
  console.log('Seeded QuoteRequest:', quoteReq.subject);

  // 4. Seed Auction (Auction)
  const auction = await db.auction.create({
    data: {
      auctionCode: 'AUC-2026-MOCK201',
      title: 'Reverse Auction for 1 HP Submersible Pumps',
      description: '[MOCK] Online competitive bidding for submersible water pump supply.',
      procurementMethod: 'REVERSE_AUCTION',
      category: 'Electrical & Electronics',
      startPrice: 85000.00,
      minDecrement: 500.00,
      startTime: now,
      endTime: futureDate,
      status: 'scheduled',
      statusEnum: 'SCHEDULED'
    }
  });
  console.log('Seeded Auction:', auction.auctionCode);

  await db.$disconnect();
  console.log('Opportunities seeding completed successfully!');
}

go().catch(err => {
  console.error('Error seeding opportunities:', err);
  process.exit(1);
});
