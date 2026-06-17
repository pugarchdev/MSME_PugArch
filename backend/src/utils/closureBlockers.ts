import prisma from '../config/prisma.js';

export interface BlockerDetail {
  type: string;
  count: number;
}

export interface ClosureBlockersResult {
  error: 'ORGANIZATION_HAS_ACTIVE_DEPENDENCIES';
  message: string;
  blockers: BlockerDetail[];
}

export async function getOrganizationClosureBlockers(organizationId: number): Promise<ClosureBlockersResult | null> {
  const db = prisma as any;

  // 1. Fetch organization users
  const orgUsers = await db.user.findMany({
    where: { organizationId },
    select: { id: true }
  });
  const orgUserIds = orgUsers.map((u: any) => u.id);

  const blockers: BlockerDetail[] = [];

  // Check Tenders & Bids
  let tenderCount = 0;
  // Tenders created by org
  tenderCount += await db.tender.count({
    where: {
      organizationId,
      NOT: {
        statusEnum: { in: ['CLOSED', 'CANCELLED'] }
      }
    }
  });
  // Active bids submitted by org users
  if (orgUserIds.length > 0) {
    tenderCount += await db.bid.count({
      where: {
        sellerId: { in: orgUserIds },
        withdrawnAt: null,
        tender: {
          NOT: {
            statusEnum: { in: ['CLOSED', 'CANCELLED'] }
          }
        }
      }
    });
    // Active tender participation invitations
    tenderCount += await db.tenderParticipant.count({
      where: {
        sellerId: { in: orgUserIds },
        status: { in: ['INVITED', 'ACCEPTED', 'INTERESTED', 'BID_SUBMITTED'] },
        tender: {
          NOT: {
            statusEnum: { in: ['CLOSED', 'CANCELLED'] }
          }
        }
      }
    });
  }
  if (tenderCount > 0) {
    blockers.push({ type: 'TENDER', count: tenderCount });
  }

  // Check RFQs
  let rfqCount = 0;
  if (orgUserIds.length > 0) {
    rfqCount += await db.quoteRequest.count({
      where: {
        OR: [
          { buyerId: { in: orgUserIds } },
          { sellerId: { in: orgUserIds } }
        ],
        NOT: {
          statusEnum: { in: ['CLOSED', 'CANCELLED'] }
        }
      }
    });
    rfqCount += await db.quoteResponse.count({
      where: {
        sellerId: { in: orgUserIds },
        status: { in: ['SUBMITTED', 'ACCEPTED'] },
        quoteRequest: {
          NOT: {
            statusEnum: { in: ['CLOSED', 'CANCELLED'] }
          }
        }
      }
    });
  }
  if (rfqCount > 0) {
    blockers.push({ type: 'RFQ', count: rfqCount });
  }

  // Check Procurement Bids
  let procurementCount = 0;
  procurementCount += await db.procurementBid.count({
    where: {
      buyerOrganizationId: organizationId,
      status: { notIn: ['CLOSED', 'CANCELLED', 'EXPIRED', 'AWARDED'] }
    }
  });
  if (orgUserIds.length > 0) {
    procurementCount += await db.procurementBidParticipation.count({
      where: {
        sellerId: { in: orgUserIds },
        submissionStatus: 'SUBMITTED',
        bid: {
          status: { notIn: ['CLOSED', 'CANCELLED', 'EXPIRED', 'AWARDED'] }
        }
      }
    });
  }
  if (procurementCount > 0) {
    blockers.push({ type: 'PROCUREMENT_BID', count: procurementCount });
  }

  // Check Purchase Orders
  let orderCount = 0;
  if (orgUserIds.length > 0) {
    orderCount += await db.purchaseOrder.count({
      where: {
        OR: [
          { buyerId: { in: orgUserIds } },
          { sellerId: { in: orgUserIds } }
        ],
        NOT: {
          OR: [
            { status: { in: ['completed', 'cancelled', 'rejected'] } },
            { poStatus: { in: ['CLOSED', 'CANCELLED'] } }
          ]
        }
      }
    });
  }
  if (orderCount > 0) {
    blockers.push({ type: 'ORDER', count: orderCount });
  }

  // Check Deliveries
  let deliveryCount = 0;
  if (orgUserIds.length > 0) {
    deliveryCount += await db.deliveryTracking.count({
      where: {
        purchaseOrder: {
          OR: [
            { buyerId: { in: orgUserIds } },
            { sellerId: { in: orgUserIds } }
          ]
        },
        NOT: {
          status: { in: ['DELIVERED', 'ACCEPTED', 'REJECTED', 'RETURNED', 'DISPUTE_RESOLVED'] }
        }
      }
    });
  }
  if (deliveryCount > 0) {
    blockers.push({ type: 'DELIVERY', count: deliveryCount });
  }

  // Check GRNs
  let grnCount = 0;
  grnCount += await db.goodsReceiptNote.count({
    where: {
      OR: [
        { organizationId },
        { purchaseOrder: { seller: { organizationId } } }
      ],
      status: { in: ['DRAFT', 'SUBMITTED', 'PARTIAL'] }
    }
  });
  if (grnCount > 0) {
    blockers.push({ type: 'GRN', count: grnCount });
  }

  // Check Invoices
  let invoiceCount = 0;
  if (orgUserIds.length > 0) {
    invoiceCount += await db.invoice.count({
      where: {
        OR: [
          { buyerId: { in: orgUserIds } },
          { sellerId: { in: orgUserIds } }
        ],
        invoiceStatus: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] }
      }
    });
  }
  if (invoiceCount > 0) {
    blockers.push({ type: 'INVOICE', count: invoiceCount });
  }

  // Check Payments
  let paymentCount = 0;
  if (orgUserIds.length > 0) {
    paymentCount += await db.paymentTransaction.count({
      where: {
        OR: [
          { payerId: { in: orgUserIds } },
          { payeeId: { in: orgUserIds } }
        ],
        paymentStatus: { in: ['INITIATED', 'PENDING', 'PROCESSING', 'PAYMENT_PENDING', 'PORTAL_PAYMENT_INITIATED'] }
      }
    });
  }
  if (paymentCount > 0) {
    blockers.push({ type: 'PAYMENT', count: paymentCount });
  }

  // Check Escrows
  let escrowCount = 0;
  if (orgUserIds.length > 0) {
    escrowCount += await db.escrowAccount.count({
      where: {
        OR: [
          { buyerId: { in: orgUserIds } },
          { sellerId: { in: orgUserIds } }
        ],
        escrowStatus: { in: ['FUNDED', 'HELD', 'PARTIALLY_RELEASED', 'FROZEN'] }
      }
    });
  }
  if (escrowCount > 0) {
    blockers.push({ type: 'ESCROW', count: escrowCount });
  }

  // Check Disputes
  let disputeCount = 0;
  disputeCount += await db.dispute.count({
    where: {
      OR: [
        { raisedByOrgId: organizationId },
        { againstOrgId: organizationId },
        { buyerOrgId: organizationId },
        { sellerOrgId: organizationId },
        ...(orgUserIds.length > 0 ? [
          { buyerId: { in: orgUserIds } },
          { sellerId: { in: orgUserIds } }
        ] : [])
      ],
      statusEnum: { in: ['OPEN', 'UNDER_REVIEW', 'AWAITING_RESPONSE', 'CLARIFICATION_REQUESTED', 'RESPONDED', 'ESCALATED'] }
    }
  });
  if (disputeCount > 0) {
    blockers.push({ type: 'DISPUTE', count: disputeCount });
  }

  // Check Fraud Alerts
  let fraudCount = 0;
  fraudCount += await db.fraudAlert.count({
    where: {
      OR: [
        { organizationId },
        ...(orgUserIds.length > 0 ? [{ userId: { in: orgUserIds } }] : [])
      ],
      status: { in: ['OPEN', 'UNDER_REVIEW', 'CONFIRMED'] }
    }
  });
  if (fraudCount > 0) {
    blockers.push({ type: 'FRAUD', count: fraudCount });
  }

  if (blockers.length > 0) {
    return {
      error: 'ORGANIZATION_HAS_ACTIVE_DEPENDENCIES',
      message: 'Organization cannot be closed because active records exist.',
      blockers
    };
  }

  return null;
}
