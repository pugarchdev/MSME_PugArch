import { ApiError } from '../../utils/ApiError.js';
import { withDistributedLock } from '../../utils/redisLock.js';
import { redisKeys } from '../../constants/redis-keys.js';
import { calculateBidPricing, quotedBidTotal } from '../../utils/bidPricing.js';
import { auditWorkflow, db, notifyWorkflow, notifyWorkflowSoon, numberSeries, type WorkflowActor } from './workflow-common.js';
import {
  bidStatusEnumFor,
  poStatusEnumFor,
  statusTransitions,
  tenderStatusEnumFor,
  type BidWorkflowStatus,
  type TenderWorkflowStatus
} from './status-transition.service.js';

const assertTenderBuyer = async (actor: WorkflowActor, tenderId: number) => {
  const tender = await db.tender.findUnique({ where: { id: tenderId } });
  if (!tender || (actor.role !== 'admin' && tender.buyerId !== actor.id)) {
    throw new ApiError(404, 'Tender not found', 'TENDER_NOT_FOUND');
  }
  return tender;
};

const assertBidSeller = async (actor: WorkflowActor, bidId: number) => {
  const bid = await db.bid.findUnique({ where: { id: bidId }, include: { tender: true } });
  if (!bid || (actor.role !== 'admin' && bid.sellerId !== actor.id)) {
    throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
  }
  return bid;
};

const assertBeforeDeadline = (tender: { closesAt?: Date | null; status?: string }) => {
  if (tender.closesAt && tender.closesAt <= new Date()) {
    throw new ApiError(409, 'Tender deadline has passed', 'TENDER_DEADLINE_PASSED');
  }
  if (!['published', 'bid_submission'].includes(String(tender.status))) {
    throw new ApiError(409, 'Tender is not open for bidding', 'TENDER_NOT_OPEN');
  }
};

const awardableTenderStatuses = new Set([
  'published',
  'bid_submission',
  'closed',
  'tech_evaluation',
  'financial_evaluation',
  'awarded',
  'po_generated'
]);

const assertTenderCanBeAwarded = (status: unknown) => {
  const current = String(status || '').trim().toLowerCase();
  if (!awardableTenderStatuses.has(current)) {
    throw new ApiError(409, `Tender cannot be awarded from ${current || 'unknown'} status`, 'STATUS_TRANSITION_INVALID');
  }
};

export const tenderWorkflow = {
  async createTender(actor: WorkflowActor, input: Record<string, unknown>) {
    if (actor.role !== 'buyer' && actor.role !== 'admin') throw new ApiError(403, 'Buyer access required', 'BUYER_REQUIRED');
    const requirementId = input.requirementId ? Number(input.requirementId) : null;
    const tender = await db.tender.create({
      data: {
        ...input,
        requirementId,
        buyerId: actor.id,
        tenderId: numberSeries('TND'),
        status: 'draft',
        statusEnum: tenderStatusEnumFor('draft')
      }
    });
    if (requirementId) {
      await db.requirement.update({
        where: { id: requirementId },
        data: { status: 'SOURCING' }
      });
    }
    await auditWorkflow(actor, 'workflow.tender.created', 'tender', tender.id);
    return tender;
  },

  async transitionTender(actor: WorkflowActor, tenderId: number, nextStatus: TenderWorkflowStatus) {
    const tender = await assertTenderBuyer(actor, tenderId);
    statusTransitions.tender(tender.status, nextStatus);
    const updated = await db.tender.update({
      where: { id: tenderId },
      data: {
        status: nextStatus,
        statusEnum: tenderStatusEnumFor(nextStatus),
        ...(nextStatus === 'published' ? { publishedAt: new Date() } : {}),
        ...(nextStatus === 'closed' ? { closedAt: new Date() } : {})
      }
    });
    await auditWorkflow(actor, `workflow.tender.${nextStatus}`, 'tender', tenderId);
    return updated;
  },

  async submitBid(actor: WorkflowActor, tenderId: number, input: Record<string, unknown>) {
    if (actor.role !== 'seller') throw new ApiError(403, 'Seller access required', 'SELLER_REQUIRED');
    const tender = await db.tender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new ApiError(404, 'Tender not found', 'TENDER_NOT_FOUND');
    assertBeforeDeadline(tender);
    const pricing = calculateBidPricing(input);
    const bid = await db.bid.upsert({
      where: { bidCompoundId: { tenderId, sellerId: actor.id } },
      update: {
        ...input,
        ...pricing,
        status: 'modified',
        statusEnum: bidStatusEnumFor('modified'),
        modifiedAt: new Date()
      },
      create: {
        ...input,
        ...pricing,
        tenderId,
        sellerId: actor.id,
        bidNumber: numberSeries('BID'),
        status: 'submitted',
        statusEnum: bidStatusEnumFor('submitted')
      }
    });
    await db.tenderParticipant.upsert({
      where: { tenderId_sellerId: { tenderId, sellerId: actor.id } },
      update: { status: 'BID_SUBMITTED', respondedAt: new Date() },
      create: { tenderId, sellerId: actor.id, status: 'BID_SUBMITTED', respondedAt: new Date() }
    }).catch(() => undefined);
    const activeBidCount = await db.bid.count({ where: { tenderId, status: { not: 'withdrawn' } } });
    await db.tender.update({ where: { id: tenderId }, data: { bidsCount: activeBidCount } }).catch(() => undefined);
    if (input.fileAssetId) {
      await db.fileAsset.updateMany({
        where: { id: Number(input.fileAssetId), ownerId: actor.id, status: 'active' },
        data: { entityType: 'bid', entityId: bid.id }
      }).catch(() => undefined);
    }
    await auditWorkflow(actor, 'workflow.bid.submitted', 'bid', bid.id, { tenderId });
    return bid;
  },

  async modifyBid(actor: WorkflowActor, bidId: number, input: Record<string, unknown>) {
    const bid = await assertBidSeller(actor, bidId);
    assertBeforeDeadline(bid.tender);
    statusTransitions.bid(bid.status, 'modified');
    const pricing = calculateBidPricing({ ...bid, ...input });
    const updated = await db.bid.update({
      where: { id: bidId },
      data: { ...input, ...pricing, status: 'modified', statusEnum: bidStatusEnumFor('modified'), modifiedAt: new Date() }
    });
    if (input.fileAssetId) {
      await db.fileAsset.updateMany({
        where: { id: Number(input.fileAssetId), ownerId: actor.id, status: 'active' },
        data: { entityType: 'bid', entityId: bidId }
      }).catch(() => undefined);
    }
    await auditWorkflow(actor, 'workflow.bid.modified', 'bid', bidId);
    return updated;
  },

  async withdrawBid(actor: WorkflowActor, bidId: number) {
    const bid = await assertBidSeller(actor, bidId);
    assertBeforeDeadline(bid.tender);
    statusTransitions.bid(bid.status, 'withdrawn');
    const updated = await db.bid.update({
      where: { id: bidId },
      data: { status: 'withdrawn', statusEnum: bidStatusEnumFor('withdrawn'), withdrawnAt: new Date() }
    });
    const activeBidCount = await db.bid.count({ where: { tenderId: bid.tenderId, status: { not: 'withdrawn' } } });
    await db.tender.update({ where: { id: bid.tenderId }, data: { bidsCount: activeBidCount } }).catch(() => undefined);
    await auditWorkflow(actor, 'workflow.bid.withdrawn', 'bid', bidId);
    return updated;
  },

  async evaluateBid(actor: WorkflowActor, bidId: number, type: 'technical' | 'financial', input: Record<string, unknown>) {
    const bid = await db.bid.findUnique({ where: { id: bidId }, include: { tender: true } });
    if (!bid || (actor.role !== 'admin' && bid.tender.buyerId !== actor.id)) throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
    if (type === 'technical') {
      const criteriaId = Number(input.criteriaId);
      const result = await db.technicalEvaluationResult.upsert({
        where: { bidId_criteriaId: { bidId, criteriaId } },
        update: { ...input, evaluatorId: actor.id, evaluatedAt: new Date() },
        create: { ...input, criteriaId, tenderId: bid.tenderId, bidId, evaluatorId: actor.id, evaluatedAt: new Date() }
      });
      const nextBidStatus: BidWorkflowStatus = input.status === 'QUALIFIED' || input.status === 'APPROVED' ? 'technical_qualified' : input.status === 'REJECTED' || input.status === 'DISQUALIFIED' ? 'technical_rejected' : 'submitted';
      if (nextBidStatus !== 'submitted') {
        await db.bid.update({ where: { id: bidId }, data: { status: nextBidStatus, statusEnum: bidStatusEnumFor(nextBidStatus) } });
      }
      await auditWorkflow(actor, 'workflow.bid.technical_evaluated', 'technicalEvaluationResult', result.id);
      return result;
    }
    const result = await db.financialEvaluation.upsert({
      where: { tenderId_bidId: { tenderId: bid.tenderId, bidId } },
      update: { ...input, evaluatorId: actor.id, evaluatedAt: new Date() },
      create: { ...input, tenderId: bid.tenderId, bidId, evaluatorId: actor.id, evaluatedAt: new Date() }
    });
    await db.bid.update({ where: { id: bidId }, data: { status: 'financial_evaluated', statusEnum: bidStatusEnumFor('financial_evaluated') } });
    await auditWorkflow(actor, 'workflow.bid.financial_evaluated', 'financialEvaluation', result.id);
    return result;
  },

  async awardBidAndGeneratePO(actor: WorkflowActor, bidId: number, title?: string) {
    const result = await db.$transaction(async (tx: any) => {
      const bid = await tx.bid.findUnique({ where: { id: bidId }, include: { tender: true } });
      if (!bid || (actor.role !== 'admin' && bid.tender.buyerId !== actor.id)) throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
      assertTenderCanBeAwarded(bid.tender.status);
      statusTransitions.bid(bid.status, 'accepted');
      const existingPo = await tx.purchaseOrder.findUnique({ where: { bidId } });
      if (existingPo) return { tender: bid.tender, bid, purchaseOrder: existingPo, reused: true };
      const amount = quotedBidTotal(bid);
      const acceptedBid = await tx.bid.update({ where: { id: bidId }, data: { status: 'accepted', statusEnum: bidStatusEnumFor('accepted') } });
      await tx.bid.updateMany({ where: { tenderId: bid.tenderId, id: { not: bidId }, status: { not: 'withdrawn' } }, data: { status: 'rejected', statusEnum: bidStatusEnumFor('rejected') } });
      const tender = await tx.tender.update({
        where: { id: bid.tenderId },
        data: { status: 'po_generated', statusEnum: tenderStatusEnumFor('po_generated'), awardedBidId: bidId }
      });
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber: numberSeries('PO'),
          tenderId: bid.tenderId,
          bidId,
          buyerId: bid.tender.buyerId,
          sellerId: bid.sellerId,
          title: title || bid.tender.title,
          amount,
          totalValue: amount,
          status: 'generated',
          poStatus: poStatusEnumFor('generated'),
          expectedDelivery: bid.deliveryDays ? new Date(Date.now() + Number(bid.deliveryDays) * 24 * 60 * 60 * 1000) : null,
          sourceType: 'tender',
          sourceId: bid.tenderId,
          metadata: {
            quotationPricing: {
              subtotal: bid.subtotal,
              taxRate: bid.taxRate,
              taxAmount: bid.taxAmount,
              discountAmount: bid.discountAmount,
              totalAmount: amount
            }
          },
          items: {
            create: [{
              itemName: bid.tender.title,
              quantity: bid.quantity,
              unitOfMeasure: 'unit',
              unitPrice: bid.unitPrice,
              taxRate: bid.taxRate,
              totalAmount: amount
            }]
          }
        }
      });
      return { tender, bid: acceptedBid, purchaseOrder: po, reused: false };
    }, {
      timeout: 15000
    });
    if (!result.reused) {
      notifyWorkflowSoon(result.purchaseOrder.sellerId, 'Tender awarded', `You were awarded ${result.purchaseOrder.title}.`, 'tender_awarded');
    }
    await auditWorkflow(actor, 'workflow.tender.awarded_po_generated', 'purchaseOrder', result.purchaseOrder.id, { bidId });
    return result;
  },

  async createComparativeStatement(actor: WorkflowActor, tenderId: number) {
    const tender = await assertTenderBuyer(actor, tenderId);
    const [bids, technicalResults, financialEvaluations] = await Promise.all([
      db.bid.findMany({ where: { tenderId }, include: { seller: { select: { id: true, name: true } } } }),
      db.technicalEvaluationResult.findMany({ where: { tenderId } }),
      db.financialEvaluation.findMany({ where: { tenderId } })
    ]);
    const summary = {
      tenderId,
      tenderTitle: tender.title,
      generatedAt: new Date().toISOString(),
      bids: bids.map((bid: any) => ({
        bidId: bid.id,
        sellerId: bid.sellerId,
        sellerName: bid.seller?.name,
        amount: quotedBidTotal(bid),
        status: bid.status,
        technicalScore: technicalResults.filter((r: any) => r.bidId === bid.id).reduce((sum: number, r: any) => sum + Number(r.score || 0), 0),
        financialRank: financialEvaluations.find((r: any) => r.bidId === bid.id)?.rank || null
      })),
      artifacts: {
        csvPlaceholder: `comparative-statement-${tenderId}.csv`,
        pdfPlaceholder: `comparative-statement-${tenderId}.pdf`
      }
    };
    const recommendedBid = summary.bids
      .filter((bid: any) => !['withdrawn', 'rejected'].includes(bid.status))
      .sort((left: any, right: any) => left.amount - right.amount)[0];
    const statement = await db.comparativeStatement.create({
      data: { tenderId, bidId: recommendedBid?.bidId || null, summary, recommended: Boolean(recommendedBid) }
    });
    await auditWorkflow(actor, 'workflow.comparative_statement.generated', 'comparativeStatement', statement.id);
    return statement;
  },

  async createAuction(actor: WorkflowActor, tenderId: number, input: Record<string, unknown>) {
    await assertTenderBuyer(actor, tenderId);
    const auction = await db.auction.create({ data: { ...input, tenderId, status: 'scheduled', statusEnum: 'SCHEDULED' } });
    await auditWorkflow(actor, 'workflow.auction.created', 'auction', auction.id);
    return auction;
  },

  async placeAuctionBid(actor: WorkflowActor, auctionId: number, input: { bidAmount: number; deviceHash?: string; ipAddress?: string; userAgentHash?: string }) {
    if (actor.role !== 'seller') throw new ApiError(403, 'Seller access required', 'SELLER_REQUIRED');
    return withDistributedLock(redisKeys.lockAuction(auctionId), async () => {
      const result = await db.$transaction(async (tx: any) => {
        const auction = await tx.auction.findUnique({ where: { id: auctionId }, include: { Tender: true } });
        if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
        const now = new Date();
        if (auction.startTime > now) throw new ApiError(409, 'Auction has not started', 'AUCTION_NOT_STARTED');
        if (auction.endTime <= now) throw new ApiError(409, 'Auction has ended', 'AUCTION_ENDED');
        if (auction.status !== 'active') {
          await tx.auction.update({ where: { id: auctionId }, data: { status: 'active', statusEnum: 'LIVE' } });
        }
        const current = Number(auction.currentLowestBid ?? auction.currentBid ?? auction.startPrice);
        const decrement = Number(auction.minDecrementAmount ?? auction.minDecrement ?? 0);
        if (!Number.isFinite(decrement) || decrement <= 0) throw new ApiError(400, 'Auction minimum decrement is not configured', 'AUCTION_MIN_DECREMENT_REQUIRED');
        const maxAllowed = current - decrement;
        if (input.bidAmount > maxAllowed) throw new ApiError(400, 'Auction bid does not satisfy minimum decrement', 'AUCTION_MIN_DECREMENT');
        const bid = await tx.auctionBid.create({
          data: {
            auctionId,
            sellerId: actor.id,
            bidAmount: input.bidAmount,
            ipAddress: input.ipAddress,
            userAgentHash: input.userAgentHash,
            deviceHash: input.deviceHash
          }
        });
        const updatedAuction = await tx.auction.update({
          where: { id: auctionId },
          data: { currentBid: input.bidAmount, currentLowestBid: input.bidAmount, currentWinnerId: actor.id }
        });
        return { auction: updatedAuction, auctionBid: bid };
      });
      await auditWorkflow(actor, 'workflow.auction.bid_placed', 'auctionBid', result.auctionBid.id, { auctionId });
      return result;
    }, { ttlMs: 5_000 });
  },

  async finalizeAuction(actor: WorkflowActor, auctionId: number) {
    const auction = await db.auction.findUnique({ where: { id: auctionId }, include: { Tender: true } });
    if (!auction || (actor.role !== 'admin' && auction.Tender.buyerId !== actor.id)) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const result = await db.$transaction(async (tx: any) => {
      const winningBid = await tx.auctionBid.findFirst({ where: { auctionId }, orderBy: [{ bidAmount: 'asc' }, { createdAt: 'asc' }] });
      const updated = await tx.auction.update({
        where: { id: auctionId },
        data: { status: 'finalized', statusEnum: 'FINALIZED', finalizedAt: new Date(), winnerSellerId: winningBid?.sellerId || null, currentWinnerId: winningBid?.sellerId || null }
      });
      return { auction: updated, winningBid };
    });
    await auditWorkflow(actor, 'workflow.auction.finalized', 'auction', auctionId, { winnerSellerId: result.auction.winnerSellerId });
    return result;
  }
};
