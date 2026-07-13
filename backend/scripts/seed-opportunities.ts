import '../src/config/env.js';
import { PrismaClient, ProcurementBidStatus, ProcurementLifecycleStage, ProcurementSubmissionStatus, ProcurementAwardStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting comprehensive seeding of 5 items per procurement method...');

  // 1. Fetch reference users
  const seller = await prisma.user.findUnique({
    where: { id: 5 },
    include: { orgMemberships: true }
  });

  const buyer = await prisma.user.findUnique({
    where: { id: 6 },
    include: { orgMemberships: true }
  });

  if (!seller) {
    console.error('Seller with ID 5 (Vasu Mishra) not found.');
    return;
  }

  if (!buyer) {
    console.error('Buyer with ID 6 (Harish Adatiya) not found.');
    return;
  }

  const buyerOrgId = buyer.orgMemberships?.[0]?.organizationId || null;
  const buyerOrgName = buyer.orgMemberships?.[0]?.organization?.organizationName || 'Govt. Buyer Org';

  // 2. Clean existing seed data created by this script to avoid duplicates
  await prisma.procurementBidAward.deleteMany({
    where: { remarks: { startsWith: '[SEED]' } }
  });
  await prisma.procurementBidParticipation.deleteMany({
    where: { participationNumber: { startsWith: 'SEED-PART-' } }
  });
  await prisma.procurementBid.deleteMany({
    where: { title: { startsWith: '[SEED]' } }
  });

  console.log('Cleaned up previous seed items.');

  const now = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(now.getDate() + 7);
  const nextMonth = new Date();
  nextMonth.setDate(now.getDate() + 30);

  // Helper to generate dynamic dates
  const getDates = (daysOffset: number) => {
    const start = new Date();
    start.setDate(now.getDate() + daysOffset - 5);
    const end = new Date();
    end.setDate(now.getDate() + daysOffset + 15);
    return { start, end };
  };

  // 3. SEED 5 RFQs
  console.log('Seeding 5 RFQs...');
  const rfqCategories = ['Electrical & Electronics', 'Office Equipment & Stationery', 'Industrial Machinery & Spare Parts', 'Safety Equipment & Industrial Safety', 'Tools & Industrial Hardware'];
  const rfqTitles = [
    'Supply of High-Grade Copper Wire Reels',
    'Bulk Office Stationery and Printing Paper Sourcing',
    'Spare Parts for CNC Milling Machinery',
    'Industrial Grade Fire Extinguishers and Safety Gear',
    'Hand Tools & Power Drill Sets for Assembly Line'
  ];
  const rfqValues = [450000, 120000, 850000, 320000, 620000];
  const rfqQtys = [500, 1000, 50, 120, 200];
  const rfqUnits = ['reels', 'boxes', 'units', 'pieces', 'sets'];

  for (let i = 0; i < 5; i++) {
    const { start, end } = getDates(i);
    const bid = await prisma.procurementBid.create({
      data: {
        bidNumber: `SEED-BID-RFQ-${100 + i}-${Date.now().toString().slice(-4)}`,
        title: `[SEED] ${rfqTitles[i]}`,
        description: `Request for Quotation for ${rfqQtys[i]} ${rfqUnits[i]} of ${rfqTitles[i].toLowerCase()}. Required immediately for production facility operations.`,
        buyerId: buyer.id,
        buyerOrganizationId: buyerOrgId,
        buyerOrganizationName: buyerOrgName,
        buyerType: 'MSME Buyer',
        category: rfqCategories[i],
        bidType: 'Product',
        procurementType: 'RFQ',
        canonicalMethod: 'RFQ',
        quantity: rfqQtys[i],
        unit: rfqUnits[i],
        estimatedValue: rfqValues[i],
        deliveryLocation: 'New Delhi Warehouse, India',
        state: 'Delhi',
        district: 'New Delhi',
        pincode: '110001',
        startDate: start,
        endDate: end,
        status: ProcurementBidStatus.OPEN,
        approvalStatus: 'APPROVED',
        lifecycleStage: ProcurementLifecycleStage.SELLER_PARTICIPATION,
        eligibilityCriteria: ['Must be certified OEM or distributor', 'Standard warranty policy applies'],
        requiredDocuments: ['GST_CERTIFICATE', 'UDYAM_CERTIFICATE'],
        termsAndConditions: ['Delivery within 15 days of order', 'Payment terms: Net 30']
      }
    });

    // Create draft participation for the first 2 RFQs, and submitted for the 3rd one
    if (i < 2) {
      await prisma.procurementBidParticipation.create({
        data: {
          bidId: bid.id,
          sellerId: seller.id,
          participationNumber: `SEED-PART-RFQ-${100 + i}`,
          technicalStatus: 'PENDING',
          financialStatus: 'LOCKED',
          submissionStatus: ProcurementSubmissionStatus.DRAFT,
          quotedAmount: rfqValues[i] * 0.95,
          gstPercentage: 18.0,
          totalAmount: rfqValues[i] * 0.95 * 1.18,
          offeredItemDescription: `Draft proposal for ${rfqTitles[i].toLowerCase()}`
        }
      });
    } else if (i === 2) {
      await prisma.procurementBidParticipation.create({
        data: {
          bidId: bid.id,
          sellerId: seller.id,
          participationNumber: `SEED-PART-RFQ-SUB`,
          technicalStatus: 'PENDING',
          financialStatus: 'LOCKED',
          submissionStatus: ProcurementSubmissionStatus.SUBMITTED,
          submittedAt: now,
          quotedAmount: rfqValues[i] * 0.92,
          gstPercentage: 18.0,
          totalAmount: rfqValues[i] * 0.92 * 1.18,
          offeredItemDescription: `Submitted proposal for ${rfqTitles[i].toLowerCase()}`
        }
      });
    }
  }

  // 4. SEED 5 RFPs
  console.log('Seeding 5 RFPs...');
  const rfpCategories = ['IT & Computer Equipment', 'Engineering Consultancy Services', 'Environmental & Waste Management', 'Automation & Robotics', 'Industrial Maintenance Services'];
  const rfpTitles = [
    'Implementation of Cloud-Based Inventory System',
    'Structural Design Consultancy for Nagpur Plant',
    'Hazardous Chemical Waste Disposal Service',
    'Warehouse Robot Sorting Automation Integration',
    'Annual Maintenance Contract for HVAC Systems'
  ];
  const rfpValues = [7500000, 1800000, 2400000, 9500000, 1500000];
  const rfpQtys = [1, 1, 12, 1, 4];
  const rfpUnits = ['system', 'service', 'months', 'integration', 'quarters'];

  for (let i = 0; i < 5; i++) {
    const { start, end } = getDates(i * 2);
    // Alternate status for visual diversity
    const status = i % 2 === 0 ? ProcurementBidStatus.TECHNICAL_EVALUATION : ProcurementBidStatus.OPEN;
    const lifecycleStage = i % 2 === 0 ? ProcurementLifecycleStage.TECHNICAL_EVALUATION : ProcurementLifecycleStage.SELLER_PARTICIPATION;

    const bid = await prisma.procurementBid.create({
      data: {
        bidNumber: `SEED-BID-RFP-${100 + i}-${Date.now().toString().slice(-4)}`,
        title: `[SEED] ${rfpTitles[i]}`,
        description: `Detailed Request for Proposal seeking service providers for ${rfpTitles[i].toLowerCase()}. Quality and SLA track record is critical.`,
        buyerId: buyer.id,
        buyerOrganizationId: buyerOrgId,
        buyerOrganizationName: buyerOrgName,
        buyerType: 'Private Enterprise',
        category: rfpCategories[i],
        bidType: 'Service',
        procurementType: 'RFP',
        canonicalMethod: 'RFP',
        quantity: rfpQtys[i],
        unit: rfpUnits[i],
        estimatedValue: rfpValues[i],
        deliveryLocation: 'Mumbai Corporate Office, India',
        state: 'Maharashtra',
        district: 'Mumbai',
        pincode: '400001',
        startDate: start,
        endDate: end,
        status: status,
        approvalStatus: 'APPROVED',
        lifecycleStage: lifecycleStage,
        eligibilityCriteria: ['ISO certified standard operations', 'Demonstrated case studies of similar works'],
        requiredDocuments: ['PAN_CARD', 'COMPANY_REGISTRATION', 'TECHNICAL_COMPLIANCE'],
        termsAndConditions: ['Strict milestone completions', 'SLA penalty clauses apply']
      }
    });

    // Create 1 submitted RFP participation
    if (i === 0) {
      await prisma.procurementBidParticipation.create({
        data: {
          bidId: bid.id,
          sellerId: seller.id,
          participationNumber: `SEED-PART-RFP-${100 + i}`,
          technicalStatus: 'QUALIFIED',
          financialStatus: 'OPENED',
          submissionStatus: ProcurementSubmissionStatus.SUBMITTED,
          submittedAt: now,
          quotedAmount: rfpValues[i] * 0.94,
          gstPercentage: 18.0,
          totalAmount: rfpValues[i] * 0.94 * 1.18,
          offeredItemDescription: `Comprehensive RFP response for ${rfpTitles[i].toLowerCase()}`
        }
      });
    }
  }

  // 5. SEED 5 Open Tenders
  console.log('Seeding 5 Open Tenders...');
  const tenderCategories = ['Construction & Building Materials', 'Pipes, Tiles & Hardware', 'Power & Energy Equipment', 'Cement & Concrete Products', 'Steel & Metal Products'];
  const tenderTitles = [
    'Construction of Warehousing Facilities in Nagpur',
    'Bulk Sourcing of PVC Pipes & Plumbing Fittings',
    'Installation of 500KW Solar Power Plant Grid',
    'Supply of Portland Pozzolana Cement (PPC)',
    'Structural Steel Girders Sourcing for Factory Extension'
  ];
  const tenderValues = [12500000, 3200000, 18500000, 1500000, 6800000];
  const tenderQtys = [1, 5000, 1, 3000, 450];
  const tenderUnits = ['facility', 'meters', 'plant', 'bags', 'metric tons'];

  for (let i = 0; i < 5; i++) {
    const { start, end } = getDates(i * 3);
    const isAwarded = i === 0;
    const status = isAwarded ? ProcurementBidStatus.AWARDED : ProcurementBidStatus.OPEN;
    const lifecycleStage = isAwarded ? ProcurementLifecycleStage.AWARDED : ProcurementLifecycleStage.SELLER_PARTICIPATION;

    const bid = await prisma.procurementBid.create({
      data: {
        bidNumber: `SEED-BID-TND-${100 + i}-${Date.now().toString().slice(-4)}`,
        title: `[SEED] ${tenderTitles[i]}`,
        description: `Public competitive open tender for ${tenderTitles[i].toLowerCase()}. Bidders must verify statutory details and submit quotes on time.`,
        buyerId: buyer.id,
        buyerOrganizationId: buyerOrgId,
        buyerOrganizationName: buyerOrgName,
        buyerType: 'Government Buyer',
        category: tenderCategories[i],
        bidType: 'Works',
        procurementType: 'OPEN_TENDER',
        canonicalMethod: 'OPEN_TENDER',
        quantity: tenderQtys[i],
        unit: tenderUnits[i],
        estimatedValue: tenderValues[i],
        deliveryLocation: 'MIDC Sourcing Hub, Nagpur',
        state: 'Maharashtra',
        district: 'Nagpur',
        pincode: '440001',
        startDate: start,
        endDate: end,
        status: status,
        approvalStatus: 'APPROVED',
        lifecycleStage: lifecycleStage,
        eligibilityCriteria: ['Statutory tax compliance filings', 'Class A contractor status'],
        requiredDocuments: ['GST_CERTIFICATE', 'COMPANY_REGISTRATION'],
        termsAndConditions: ['Tender fee and EMD required', 'Liquidated damages apply for delay']
      }
    });

    // Create participation for Nagpur warehouse construction, and mark it as awarded L1
    if (isAwarded) {
      const part = await prisma.procurementBidParticipation.create({
        data: {
          bidId: bid.id,
          sellerId: seller.id,
          participationNumber: `SEED-PART-TND-${100 + i}`,
          technicalStatus: 'QUALIFIED',
          financialStatus: 'OPENED',
          finalStatus: 'AWARDED',
          submissionStatus: ProcurementSubmissionStatus.SUBMITTED,
          submittedAt: now,
          quotedAmount: tenderValues[i] * 0.93,
          gstPercentage: 12.0,
          totalAmount: tenderValues[i] * 0.93 * 1.12,
          offeredItemDescription: `Nagpur factory expansion civil construction bid response.`
        }
      });

      await prisma.procurementBidAward.create({
        data: {
          bidId: bid.id,
          participationId: part.id,
          sellerId: seller.id,
          awardedAmount: tenderValues[i] * 0.93,
          awardStatus: ProcurementAwardStatus.ADMIN_APPROVED,
          awardedById: buyer.id,
          remarks: '[SEED] Selected as L1 bidder after technical qualification.'
        }
      });
    } else if (i === 1) {
      // Also submit a regular bid
      await prisma.procurementBidParticipation.create({
        data: {
          bidId: bid.id,
          sellerId: seller.id,
          participationNumber: `SEED-PART-TND-${100 + i}`,
          technicalStatus: 'PENDING',
          financialStatus: 'LOCKED',
          submissionStatus: ProcurementSubmissionStatus.SUBMITTED,
          submittedAt: now,
          quotedAmount: tenderValues[i] * 0.98,
          gstPercentage: 12.0,
          totalAmount: tenderValues[i] * 0.98 * 1.12,
          offeredItemDescription: `Standard plumbing fittings bulk submission`
        }
      });
    }
  }

  // 6. SEED 5 Limited Tenders (My Invitations)
  console.log('Seeding 5 Limited Tenders...');
  const limitedCategories = ['Mechanical & Engineering', 'Industrial Chemicals', 'Automobile Parts & Services', 'Bearings & Mechanical Components', 'Electrical Cables & Power Equipment'];
  const limitedTitles = [
    'CNC Custom Lathe Work & Machine Machining',
    'Bulk Supply of Industrial Sulfuric Acid',
    'Fleet Vehicle Brake System Maintenance Service',
    'Ball Bearings & Rolled Sleeves Sourcing',
    'High-Voltage Armored Power Cables'
  ];
  const limitedValues = [850000, 1400000, 550000, 350000, 2200000];
  const limitedQtys = [1000, 15000, 24, 2500, 800];
  const limitedUnits = ['machined parts', 'liters', 'vehicles', 'units', 'meters'];

  for (let i = 0; i < 5; i++) {
    const { start, end } = getDates(i * 4);
    const bid = await prisma.procurementBid.create({
      data: {
        bidNumber: `SEED-BID-LTD-${100 + i}-${Date.now().toString().slice(-4)}`,
        title: `[SEED] ${limitedTitles[i]}`,
        description: `Restricted bidding invitation for ${limitedTitles[i].toLowerCase()} sent to pre-vetted suppliers.`,
        buyerId: buyer.id,
        buyerOrganizationId: buyerOrgId,
        buyerOrganizationName: buyerOrgName,
        buyerType: 'Private Enterprise',
        category: limitedCategories[i],
        bidType: 'Product',
        procurementType: 'LIMITED_TENDER',
        canonicalMethod: 'LIMITED_TENDER',
        quantity: limitedQtys[i],
        unit: limitedUnits[i],
        estimatedValue: limitedValues[i],
        deliveryLocation: 'Pune Assembly Hub, MIDC, India',
        state: 'Maharashtra',
        district: 'Pune',
        pincode: '411018',
        startDate: start,
        endDate: end,
        status: ProcurementBidStatus.OPEN,
        approvalStatus: 'APPROVED',
        lifecycleStage: ProcurementLifecycleStage.SELLER_PARTICIPATION,
        eligibilityCriteria: ['Pre-qualified partner status in company register'],
        requiredDocuments: ['GST_CERTIFICATE'],
        termsAndConditions: ['Immediate delivery upon dispatch clearance']
      }
    });

    // CRITICAL: We MUST create a ProcurementBidParticipation record for Vasu Mishra (ID 5)
    // so that the seller passes the query filters (participations: { some: { sellerId: 5 } })
    // and can see the Limited Tender under "My Invitations"!
    // We will set status to DRAFT to represent a fresh invitation they can open and submit.
    const partStatus = i === 0 ? ProcurementSubmissionStatus.SUBMITTED : ProcurementSubmissionStatus.DRAFT;
    const partAmt = partStatus === ProcurementSubmissionStatus.SUBMITTED ? limitedValues[i] * 0.94 : null;
    await prisma.procurementBidParticipation.create({
      data: {
        bidId: bid.id,
        sellerId: seller.id,
        participationNumber: `SEED-PART-LTD-${100 + i}`,
        technicalStatus: 'PENDING',
        financialStatus: 'LOCKED',
        submissionStatus: partStatus,
        quotedAmount: partAmt,
        gstPercentage: 18.0,
        totalAmount: partAmt ? partAmt * 1.18 : null,
        offeredItemDescription: `Direct invited response for ${limitedTitles[i].toLowerCase()}`
      }
    });
  }

  // 7. SEED 5 Reverse Auctions
  console.log('Seeding 5 Reverse Auctions...');
  const auctionCategories = ['IT & Computer Equipment', 'Office Equipment & Stationery', 'Electrical Cables & Power Equipment', 'IT & Computer Equipment', 'Office Equipment & Stationery'];
  const auctionTitles = [
    'Reverse Auction for Office Laptops Supply',
    'Reverse Auction for Premium Ergonomic Chairs',
    'Reverse Auction for Diesel Generator Sets (250 KVA)',
    'Reverse Auction for Android Enterprise Tablets',
    'Reverse Auction for Paper Shredders & Shredder Bags'
  ];
  const auctionValues = [5500000, 750000, 2800000, 1850000, 220000];
  const auctionQtys = [100, 80, 2, 60, 40];
  const auctionUnits = ['units', 'chairs', 'generators', 'tablets', 'units'];

  for (let i = 0; i < 5; i++) {
    const { start, end } = getDates(i * 5);
    await prisma.procurementBid.create({
      data: {
        bidNumber: `SEED-BID-RA-${100 + i}-${Date.now().toString().slice(-4)}`,
        title: `[SEED] ${auctionTitles[i]}`,
        description: `Live reverse auction event for ${auctionTitles[i].toLowerCase()}. Bidders must bid down to win the contract.`,
        buyerId: buyer.id,
        buyerOrganizationId: buyerOrgId,
        buyerOrganizationName: buyerOrgName,
        buyerType: 'Private Enterprise',
        category: auctionCategories[i],
        bidType: 'Product',
        procurementType: 'REVERSE_AUCTION',
        canonicalMethod: 'REVERSE_AUCTION',
        quantity: auctionQtys[i],
        unit: auctionUnits[i],
        estimatedValue: auctionValues[i],
        deliveryLocation: 'Corporate HQ, Mumbai, India',
        state: 'Maharashtra',
        district: 'Mumbai',
        pincode: '400013',
        startDate: start,
        endDate: end,
        status: ProcurementBidStatus.OPEN,
        approvalStatus: 'APPROVED',
        lifecycleStage: ProcurementLifecycleStage.SELLER_PARTICIPATION,
        eligibilityCriteria: ['Authorized dealer license required', 'On-site service center available'],
        requiredDocuments: ['GST_CERTIFICATE'],
        termsAndConditions: ['Real-time downward bidding decrements', 'Delivery within 21 days of auction close']
      }
    });
  }

  console.log('Successfully completed seeding 5 items per method (25 total procurements seeded)! 🚀');
}

main()
  .catch(err => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
