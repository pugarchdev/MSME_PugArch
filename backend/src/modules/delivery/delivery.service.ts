/**
 * Delivery Tracking Service.
 *
 * Wraps the existing fulfillment workflow with the richer, role-aware delivery
 * lifecycle described in the procurement spec. The service is the single place
 * that mutates DeliveryTracking and writes DeliveryStatusLog rows so that audit,
 * notifications, and PO synchronization stay consistent.
 *
 * Design notes:
 *  - We never delete history. Status changes always insert a DeliveryStatusLog
 *    row in addition to advancing the parent record.
 *  - Every mutation funnels through {@link transitionStatus} which validates
 *    the allowed transition map (admin can override with a reason).
 *  - Notifications and audit logs are best-effort: failures must not block the
 *    business operation but they are logged.
 */

import prisma from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { auditLog } from '../audit/audit.service.js';
import { notificationService } from '../../services/notification.service.js';
import { poStatusEnumFor } from '../../services/workflow/status-transition.service.js';
import {
  DELIVERY_STATUS_TRANSITIONS,
  DELIVERY_NOTIFICATION_TYPE,
  TERMINAL_STATUSES,
  type DeliveryStatus,
  type DeliveryDocumentType,
  type DeliveryParticipantRole
} from './delivery.constants.js';

const db = prisma as any;

/**
 * Tunable transaction window. Defaults to 20s so that Neon serverless cold
 * starts (which can take 8-12s on the first query after idle) don't trip the
 * default 5s Prisma transaction timeout. maxWait is the time Prisma will wait
 * to even acquire a connection from the pool before giving up.
 */
const TX_OPTIONS = { timeout: 20_000, maxWait: 8_000 } as const;

export type DeliveryActor = {
  id: number;
  role: string;
  ipAddress?: string;
  userAgent?: string;
};

const safeAudit = (
  actor: DeliveryActor,
  action: string,
  entityType: string,
  entityId: number | string | undefined,
  metadata?: Record<string, unknown>
) =>
  auditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata
  }).catch(() => undefined);

const safeNotify = (
  userId: number | null | undefined,
  title: string,
  message: string,
  redirectUrl: string,
  priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
) => {
  if (!userId) return Promise.resolve(null);
  return (async () => {
    // Respect the user's procurement alert preference. If they've muted
    // procurement notifications, silently skip both the in-app + email push.
    try {
      const pref = await db.notificationPreference.findUnique({ where: { userId } });
      if (pref && pref.procurementAlerts === false) return null;
    } catch {
      // If the preference fetch fails, fall through and notify by default.
    }
    return notificationService
      .notifyWithEmail(userId, {
        title,
        message,
        type: DELIVERY_NOTIFICATION_TYPE,
        priority,
        redirectUrl
      })
      .catch(() => null);
  })();
};

const isAdmin = (actor: DeliveryActor) => actor.role === 'admin';

const loadDelivery = async (id: number) => {
  const delivery = await db.deliveryTracking.findUnique({
    where: { id },
    include: {
      purchaseOrder: {
        include: {
          buyer: true,
          seller: true,
          invoices: {
            orderBy: { createdAt: 'desc' },
            include: {
              invoiceFile: { select: { id: true, originalName: true, mimeType: true } }
            }
          }
        }
      },
      documents: { include: { fileAsset: true } },
      participants: { where: { isActive: true }, include: { user: true } },
      acceptance: true,
      settlement: true,
      logisticsPartner: true,
      events: { orderBy: { occurredAt: 'desc' } },
      statusLogs: { orderBy: { createdAt: 'desc' } }
    }
  });
  if (!delivery) throw new ApiError(404, 'Delivery not found', 'DELIVERY_NOT_FOUND');
  return delivery;
};

const loadDeliveryByPO = async (purchaseOrderId: number) =>
  db.deliveryTracking.findFirst({
    where: { purchaseOrderId },
    orderBy: { createdAt: 'desc' },
    include: {
      purchaseOrder: {
        include: {
          buyer: true,
          seller: true,
          invoices: {
            orderBy: { createdAt: 'desc' },
            include: {
              invoiceFile: { select: { id: true, originalName: true, mimeType: true } }
            }
          }
        }
      },
      documents: { include: { fileAsset: true } },
      participants: { where: { isActive: true }, include: { user: true } },
      acceptance: true,
      settlement: true,
      logisticsPartner: true,
      events: { orderBy: { occurredAt: 'desc' } },
      statusLogs: { orderBy: { createdAt: 'desc' } }
    }
  });

const isParticipant = (delivery: any, userId: number, role?: DeliveryParticipantRole) =>
  Array.isArray(delivery.participants) &&
  delivery.participants.some(
    (p: any) => p.userId === userId && p.isActive && (!role || p.participantRole === role)
  );

/**
 * Resolve the actor's effective access role for this delivery. A buyer may also
 * be the consignee. A seller-side user might be assigned as logistics. Admin is
 * always granted.
 */
export const resolveAccessRole = (delivery: any, actor: DeliveryActor) => {
  if (isAdmin(actor)) return 'admin';
  const po = delivery.purchaseOrder;
  if (po?.sellerId === actor.id) return 'seller';
  if (po?.buyerId === actor.id) return 'buyer';
  if (isParticipant(delivery, actor.id, 'CONSIGNEE')) return 'consignee';
  if (isParticipant(delivery, actor.id, 'LOGISTICS_PARTNER')) return 'logistics';
  if (isParticipant(delivery, actor.id, 'FINANCE_OFFICER')) return 'finance';
  if (isParticipant(delivery, actor.id, 'DISPUTE_OFFICER')) return 'dispute';
  return null;
};

const ensureAccess = (delivery: any, actor: DeliveryActor) => {
  const accessRole = resolveAccessRole(delivery, actor);
  if (!accessRole) throw new ApiError(403, 'Access denied', 'DELIVERY_ACCESS_DENIED');
  return accessRole;
};

const ensureRole = (
  delivery: any,
  actor: DeliveryActor,
  allowed: Array<'seller' | 'buyer' | 'consignee' | 'logistics' | 'finance' | 'dispute' | 'admin'>
) => {
  const accessRole = ensureAccess(delivery, actor);
  if (!allowed.includes(accessRole as any)) {
    throw new ApiError(403, 'You are not allowed to perform this action', 'DELIVERY_ROLE_FORBIDDEN');
  }
  return accessRole;
};

const ensureNotTerminal = (delivery: any) => {
  if (TERMINAL_STATUSES.includes(delivery.status)) {
    throw new ApiError(
      409,
      `Delivery is ${delivery.status} and cannot be modified`,
      'DELIVERY_TERMINAL'
    );
  }
};

const validateTransition = (
  current: DeliveryStatus,
  next: DeliveryStatus,
  options: { adminOverride?: boolean } = {}
) => {
  if (current === next) return;
  if (options.adminOverride) return;
  const allowed = DELIVERY_STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw new ApiError(
      409,
      `Delivery cannot transition from ${current} to ${next}`,
      'DELIVERY_STATUS_TRANSITION_INVALID'
    );
  }
};

/**
 * Atomic status transition: writes DeliveryTracking, DeliveryTrackingEvent,
 * DeliveryStatusLog, and (optionally) advances the linked PO status.
 */
const transitionStatus = async (
  tx: any,
  delivery: any,
  next: DeliveryStatus,
  actor: DeliveryActor,
  meta: {
    location?: string;
    remarks?: string;
    occurredAt?: Date;
    fileAssetId?: number;
    extra?: Record<string, unknown>;
    adminOverride?: boolean;
    extraData?: Record<string, unknown>;
    poStatus?: string;
  } = {}
) => {
  validateTransition(delivery.status, next, { adminOverride: meta.adminOverride });

  const updateData: Record<string, unknown> = {
    status: next,
    currentLocation: meta.location ?? delivery.currentLocation,
    ...(meta.extraData || {})
  };

  if (next === 'DELIVERED') updateData.actualDelivery = meta.occurredAt || new Date();
  if (next === 'CLOSED') updateData.closedAt = new Date();

  const updated = await tx.deliveryTracking.update({ where: { id: delivery.id }, data: updateData });

  await tx.deliveryTrackingEvent.create({
    data: {
      deliveryTrackingId: delivery.id,
      status: next,
      location: meta.location,
      remarks: meta.remarks,
      occurredAt: meta.occurredAt || new Date()
    }
  });

  await tx.deliveryStatusLog.create({
    data: {
      deliveryTrackingId: delivery.id,
      previousStatus: delivery.status,
      newStatus: next,
      changedById: actor.id,
      actorRole: actor.role,
      remarks: meta.remarks,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      fileAssetId: meta.fileAssetId,
      metadata: meta.extra ? meta.extra : undefined
    }
  });

  if (meta.poStatus) {
    await tx.purchaseOrder.update({
      where: { id: delivery.purchaseOrderId },
      data: {
        status: meta.poStatus,
        poStatus: poStatusEnumFor(meta.poStatus as any) as any,
        version: { increment: 1 }
      }
    }).catch(() => undefined);
  }

  return updated;
};

/* =====================================================================
 * High-level operations
 * =================================================================== */

const operationOrThrow = async <T>(operation: Promise<T>): Promise<T> => operation;

const notifyOrderParties = async (
  delivery: any,
  next: DeliveryStatus,
  actor: DeliveryActor,
  remarks?: string
) => {
  const po = delivery.purchaseOrder;
  if (!po) return;
  const title = `Delivery ${next.replace(/_/g, ' ').toLowerCase()}`;
  const message = `Order ${po.poNumber || po.id} is now ${next}${remarks ? ` - ${remarks}` : ''}`;
  const isUrgent = ['DISPUTE_RAISED', 'DELIVERY_FAILED', 'SELLER_REJECTED', 'REJECTED'].includes(next);
  const priority = isUrgent ? 'high' : 'medium';
  // Notify both buyer and seller for transparency, and any participants too.
  const recipients = new Set<number>();
  if (po.buyerId && po.buyerId !== actor.id) recipients.add(po.buyerId);
  if (po.sellerId && po.sellerId !== actor.id) recipients.add(po.sellerId);
  for (const participant of delivery.participants || []) {
    if (participant.userId && participant.userId !== actor.id) recipients.add(participant.userId);
  }
  await Promise.allSettled(
    [...recipients].map(uid => safeNotify(uid, title, message, `/dashboard/delivery/${delivery.id}`, priority))
  );
};

export const deliveryService = {
  resolveAccessRole,

  /**
   * One-time backfill helper: ensures every purchase order has a
   * DeliveryTracking row. Useful after the module is first deployed against an
   * existing database. Idempotent.
   */
  async backfillDeliveriesForExistingPOs(actor: DeliveryActor) {
    if (!isAdmin(actor)) {
      throw new ApiError(403, 'Admin access required', 'BACKFILL_ADMIN_ONLY');
    }
    const orphans = await db.purchaseOrder.findMany({
      where: {
        status: { notIn: ['cancelled', 'completed'] },
        deliveryTrackings: { none: {} }
      },
      select: { id: true, expectedDelivery: true }
    });
    if (orphans.length === 0) return { created: 0 };
    await db.deliveryTracking.createMany({
      data: orphans.map((po: any) => ({
        purchaseOrderId: po.id,
        status: 'CREATED',
        expectedDelivery: po.expectedDelivery || null
      })),
      skipDuplicates: true
    });
    void safeAudit(actor, 'delivery.backfill', 'deliveryTracking', undefined, { count: orphans.length });
    return { created: orphans.length };
  },

  async listForActor(actor: DeliveryActor, query: Record<string, unknown> = {}) {
    // Auto-seed delivery records for the actor's POs so the list reflects
    // every active order even if the seller hasn't manually started dispatch.
    //
    // PRODUCTION SAFETY: this fires off a write on every list-page visit. In
    // dev that's a feature; in prod it would let any user trigger a hidden
    // bulk insert. So we gate it behind a flag that defaults to ON in dev and
    // OFF everywhere else. Admins can run a one-shot backfill via the
    // dedicated POST /api/delivery/admin/backfill endpoint when needed.
    const autoSeedEnabled =
      process.env.DELIVERY_AUTO_SEED === 'true' ||
      (process.env.NODE_ENV !== 'production' && process.env.DELIVERY_AUTO_SEED !== 'false');

    if (autoSeedEnabled) {
      if (actor.role === 'seller' || actor.role === 'buyer') {
        const ownedPOs = await db.purchaseOrder.findMany({
          where: {
            ...(actor.role === 'seller' ? { sellerId: actor.id } : { buyerId: actor.id }),
            status: { notIn: ['cancelled', 'completed'] },
            deliveryTrackings: { none: {} }
          },
          select: { id: true, expectedDelivery: true }
        });
        if (ownedPOs.length > 0) {
          await db.deliveryTracking.createMany({
            data: ownedPOs.map((po: any) => ({
              purchaseOrderId: po.id,
              status: 'CREATED',
              expectedDelivery: po.expectedDelivery || null
            })),
            skipDuplicates: true
          }).catch(() => undefined);
        }
      } else if (isAdmin(actor)) {
        // Admin sees everything: backfill deliveries for any orphan POs so the
        // console reflects the full universe of active orders.
        const orphanCount = await db.purchaseOrder.count({
          where: {
            status: { notIn: ['cancelled', 'completed'] },
            deliveryTrackings: { none: {} }
          }
        }).catch(() => 0);
        if (orphanCount > 0) {
          const orphans = await db.purchaseOrder.findMany({
            where: {
              status: { notIn: ['cancelled', 'completed'] },
              deliveryTrackings: { none: {} }
            },
            select: { id: true, expectedDelivery: true },
            take: 500
          });
          await db.deliveryTracking.createMany({
            data: orphans.map((po: any) => ({
              purchaseOrderId: po.id,
              status: 'CREATED',
              expectedDelivery: po.expectedDelivery || null
            })),
            skipDuplicates: true
          }).catch(() => undefined);
        }
      }
    }

    const where: any = {};
    if (!isAdmin(actor)) {
      where.OR = [
        { purchaseOrder: { sellerId: actor.id } },
        { purchaseOrder: { buyerId: actor.id } },
        { participants: { some: { userId: actor.id, isActive: true } } }
      ];
    }
    if (query.status) where.status = query.status;
    if (query.q) {
      const term = String(query.q).trim();
      if (term.length > 0) {
        const searchClauses = [
          { trackingNumber: { contains: term, mode: 'insensitive' as const } },
          { carrierName: { contains: term, mode: 'insensitive' as const } },
          { logisticsPartnerName: { contains: term, mode: 'insensitive' as const } },
          { currentLocation: { contains: term, mode: 'insensitive' as const } },
          { purchaseOrder: { poNumber: { contains: term, mode: 'insensitive' as const } } },
          { purchaseOrder: { title: { contains: term, mode: 'insensitive' as const } } },
          { purchaseOrder: { seller: { name: { contains: term, mode: 'insensitive' as const } } } },
          { purchaseOrder: { buyer: { name: { contains: term, mode: 'insensitive' as const } } } }
        ];
        where.AND = [...(where.AND || []), { OR: searchClauses }];
      }
    }
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) (where.createdAt as any).gte = new Date(query.fromDate as string);
      if (query.toDate) (where.createdAt as any).lte = new Date(query.toDate as string);
    }
    const take = Math.min(100, Math.max(1, Number(query.pageSize ?? query.take ?? 50)));
    const skip = query.page ? (Math.max(1, Number(query.page)) - 1) * take : Math.max(0, Number(query.skip ?? 0));
    const [records, total] = await Promise.all([
      db.deliveryTracking.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        // Lean payload for list views — heavy fields (events, settlement,
        // acceptance, logisticsPartner) are loaded only when the detail
        // page calls /delivery/:id. This shaves multiple sub-queries off
        // every list request and dropped Neon-cold-start latency from ~6s
        // to <1.5s for typical org sizes.
        include: {
          purchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              title: true,
              amount: true,
              totalValue: true,
              expectedDelivery: true,
              status: true,
              poStatus: true,
              buyer: { select: { id: true, name: true } },
              seller: { select: { id: true, name: true } }
            }
          },
          logisticsPartner: { select: { id: true, name: true } }
        },
        skip,
        take
      }),
      db.deliveryTracking.count({ where })
    ]);
    return { records, total, skip, take };
  },

  async getDetail(actor: DeliveryActor, id: number) {
    const delivery = await loadDelivery(id);
    ensureAccess(delivery, actor);
    return delivery;
  },

  async getByPurchaseOrder(actor: DeliveryActor, purchaseOrderId: number) {
    const delivery = await loadDeliveryByPO(purchaseOrderId);
    if (!delivery) {
      // Fall back to PO ownership check, since the PO might not have a delivery yet.
      const po = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
      if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
      if (!isAdmin(actor) && po.buyerId !== actor.id && po.sellerId !== actor.id) {
        throw new ApiError(403, 'Access denied', 'PO_ACCESS_DENIED');
      }
      return null;
    }
    ensureAccess(delivery, actor);
    return delivery;
  },

  async getTimeline(actor: DeliveryActor, id: number) {
    const delivery = await loadDelivery(id);
    ensureAccess(delivery, actor);
    return {
      delivery,
      events: delivery.events,
      statusLogs: delivery.statusLogs
    };
  },

  /**
   * Idempotent ensure: returns existing delivery for a PO or creates a fresh
   * CREATED record. Used both internally and by the seller dispatch flow.
   */
  async ensureDeliveryForPO(actor: DeliveryActor, purchaseOrderId: number, input: Record<string, any> = {}) {
    const po = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (!isAdmin(actor) && po.sellerId !== actor.id && po.buyerId !== actor.id) {
      throw new ApiError(403, 'Access denied', 'PO_ACCESS_DENIED');
    }
    let delivery = await loadDeliveryByPO(purchaseOrderId);
    if (delivery) return delivery;

    delivery = await db.deliveryTracking.create({
      data: {
        purchaseOrderId,
        status: 'CREATED',
        trackingNumber: input.trackingNumber || undefined,
        carrierName: input.carrierName || undefined,
        expectedDelivery: input.expectedDelivery || po.expectedDelivery || undefined,
        currentLocation: input.currentLocation || undefined,
        logisticsPartnerId: input.logisticsPartnerId || undefined,
        logisticsPartnerName: input.logisticsPartnerName || undefined,
        remarks: input.remarks || undefined
      }
    });

    await db.deliveryStatusLog.create({
      data: {
        deliveryTrackingId: delivery.id,
        previousStatus: null,
        newStatus: 'CREATED',
        changedById: actor.id,
        actorRole: actor.role,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        remarks: input.remarks || 'Delivery record created'
      }
    });

    void safeAudit(actor, 'delivery.created', 'deliveryTracking', delivery.id, { purchaseOrderId });
    return loadDelivery(delivery.id);
  },

  /* ===== Seller actions ===== */

  async sellerAccept(actor: DeliveryActor, id: number, body: { remarks?: string; expectedDelivery?: Date }) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['seller', 'admin']);
    ensureNotTerminal(delivery);
    const updated = await db.$transaction(tx =>
      transitionStatus(tx, delivery, 'SELLER_ACCEPTED', actor, {
        remarks: body.remarks,
        extraData: {
          sellerAcceptedAt: new Date(),
          expectedDelivery: body.expectedDelivery || delivery.expectedDelivery
        },
        poStatus: 'accepted'
      })
      , TX_OPTIONS);
    void safeAudit(actor, 'delivery.seller_accepted', 'deliveryTracking', id, { remarks: body.remarks });
    void notifyOrderParties(delivery, 'SELLER_ACCEPTED', actor, body.remarks);
    return updated;
  },

  async sellerReject(actor: DeliveryActor, id: number, body: { reason: string }) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['seller', 'admin']);
    ensureNotTerminal(delivery);
    const updated = await db.$transaction(tx =>
      transitionStatus(tx, delivery, 'SELLER_REJECTED', actor, {
        remarks: body.reason,
        extraData: { sellerRejectedAt: new Date(), sellerRejectReason: body.reason },
        poStatus: 'cancelled'
      })
      , TX_OPTIONS);
    void safeAudit(actor, 'delivery.seller_rejected', 'deliveryTracking', id, { reason: body.reason });
    void notifyOrderParties(delivery, 'SELLER_REJECTED', actor, body.reason);
    return updated;
  },

  async setPacked(actor: DeliveryActor, id: number, body: any) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['seller', 'admin']);
    ensureNotTerminal(delivery);
    const updated = await db.$transaction(tx =>
      transitionStatus(tx, delivery, 'PACKED', actor, {
        remarks: body.remarks,
        extraData: {
          packedAt: new Date(),
          packageWeightKg: body.packageWeightKg,
          packageDimensions: body.packageDimensions,
          packageCount: body.packageCount
        }
      })
      , TX_OPTIONS);
    void safeAudit(actor, 'delivery.packed', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, 'PACKED', actor, body.remarks);
    return updated;
  },

  async updateDispatchDetails(actor: DeliveryActor, id: number, body: any) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['seller', 'admin']);
    ensureNotTerminal(delivery);
    if (body.trackingNumber) {
      const existing = await db.deliveryTracking.findFirst({
        where: { trackingNumber: body.trackingNumber, NOT: { id } }
      });
      if (existing) {
        throw new ApiError(409, 'Tracking number is already in use', 'DELIVERY_TRACKING_DUPLICATE');
      }
    }
    const updated = await db.deliveryTracking.update({
      where: { id },
      data: {
        trackingNumber: body.trackingNumber ?? delivery.trackingNumber,
        carrierName: body.carrierName ?? delivery.carrierName,
        logisticsPartnerId: body.logisticsPartnerId ?? delivery.logisticsPartnerId,
        logisticsPartnerName: body.logisticsPartnerName ?? delivery.logisticsPartnerName,
        logisticsContact: body.logisticsContact ?? delivery.logisticsContact,
        ewayBillNumber: body.ewayBillNumber ?? delivery.ewayBillNumber,
        courierReceiptNumber: body.courierReceiptNumber ?? delivery.courierReceiptNumber,
        expectedDelivery: body.expectedDelivery ?? delivery.expectedDelivery,
        remarks: body.remarks ?? delivery.remarks
      }
    });
    await db.deliveryStatusLog.create({
      data: {
        deliveryTrackingId: id,
        previousStatus: delivery.status,
        newStatus: delivery.status,
        changedById: actor.id,
        actorRole: actor.role,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        remarks: 'Dispatch details updated',
        metadata: body
      }
    });
    void safeAudit(actor, 'delivery.dispatch_details_updated', 'deliveryTracking', id, body);
    return updated;
  },

  async markReadyForPickup(actor: DeliveryActor, id: number, body: any) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['seller', 'admin']);
    ensureNotTerminal(delivery);
    const updated = await db.$transaction(tx =>
      transitionStatus(tx, delivery, 'READY_FOR_PICKUP', actor, { remarks: body?.remarks })
      , TX_OPTIONS);
    void safeAudit(actor, 'delivery.ready_for_pickup', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, 'READY_FOR_PICKUP', actor, body?.remarks);
    return updated;
  },

  async markDispatched(actor: DeliveryActor, id: number, body: any) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['seller', 'logistics', 'admin']);
    ensureNotTerminal(delivery);
    const updated = await db.$transaction(tx =>
      transitionStatus(tx, delivery, 'DISPATCHED', actor, {
        location: body?.location,
        remarks: body?.remarks,
        poStatus: 'in_fulfillment'
      })
      , TX_OPTIONS);
    void safeAudit(actor, 'delivery.dispatched', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, 'DISPATCHED', actor, body?.remarks);
    return updated;
  },

  /* ===== Logistics actions ===== */

  async logisticsStatusUpdate(actor: DeliveryActor, id: number, body: any) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['logistics', 'seller', 'admin']);
    ensureNotTerminal(delivery);
    const next = body.status as DeliveryStatus;
    const updated = await db.$transaction(tx =>
      transitionStatus(tx, delivery, next, actor, {
        location: body.location,
        remarks: body.remarks,
        occurredAt: body.occurredAt,
        extraData:
          next === 'PICKED_UP'
            ? { pickedUpAt: new Date() }
            : next === 'PICKUP_SCHEDULED'
              ? { pickupScheduledAt: new Date() }
              : undefined,
        poStatus: next === 'DELIVERED' ? 'delivered' : undefined
      })
      , TX_OPTIONS);
    void safeAudit(actor, 'delivery.logistics_update', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, next, actor, body.remarks);
    return updated;
  },

  /* ===== Documents ===== */

  async addDocument(
    actor: DeliveryActor,
    id: number,
    body: { documentType: DeliveryDocumentType; fileAssetId: number; description?: string }
  ) {
    const delivery = await loadDelivery(id);
    const accessRole = ensureAccess(delivery, actor);
    const fileAsset = await db.fileAsset.findUnique({ where: { id: body.fileAssetId } });
    if (!fileAsset) throw new ApiError(404, 'File asset not found', 'FILE_ASSET_NOT_FOUND');
    if (!isAdmin(actor) && fileAsset.ownerId !== actor.id) {
      throw new ApiError(403, 'You can only attach files you uploaded', 'FILE_ASSET_OWNERSHIP');
    }
    const document = await db.deliveryDocument.create({
      data: {
        deliveryTrackingId: id,
        fileAssetId: body.fileAssetId,
        documentType: body.documentType,
        uploadedById: actor.id,
        uploaderRole: actor.role,
        description: body.description
      }
    });
    void safeAudit(actor, 'delivery.document_uploaded', 'deliveryDocument', document.id, {
      documentType: body.documentType,
      accessRole
    });
    return document;
  },

  async listDocuments(actor: DeliveryActor, id: number) {
    const delivery = await loadDelivery(id);
    ensureAccess(delivery, actor);
    return db.deliveryDocument.findMany({
      where: { deliveryTrackingId: id },
      include: { fileAsset: true, uploadedBy: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' }
    });
  },

  /* ===== Buyer / Consignee actions ===== */

  async buyerOrConsigneeAccept(actor: DeliveryActor, id: number, body: any) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['buyer', 'consignee', 'admin']);
    ensureNotTerminal(delivery);
    if (!['DELIVERED', 'DELIVERY_CONFIRMATION_PENDING', 'DISPUTE_RESOLVED'].includes(delivery.status)) {
      throw new ApiError(
        409,
        'Delivery must be marked as delivered before buyer/consignee can accept it',
        'DELIVERY_NOT_DELIVERED'
      );
    }
    const next: DeliveryStatus = body.accepted ? 'ACCEPTED' : 'REJECTED';
    const updated = await db.$transaction(async tx => {
      const transitioned = await transitionStatus(tx, delivery, next, actor, {
        remarks: body.remarks || body.rejectionReason
      });
      await tx.buyerAcceptance.upsert({
        where: { deliveryTrackingId: id },
        create: {
          deliveryTrackingId: id,
          acceptedById: actor.id,
          accepted: body.accepted,
          acceptedAt: body.accepted ? new Date() : null,
          rejectedAt: body.accepted ? null : new Date(),
          rejectionReason: body.rejectionReason,
          inspectionStatus: body.inspectionStatus,
          damageNotes: body.damageNotes,
          missingQuantity: body.missingQuantity,
          remarks: body.remarks
        },
        update: {
          acceptedById: actor.id,
          accepted: body.accepted,
          acceptedAt: body.accepted ? new Date() : null,
          rejectedAt: body.accepted ? null : new Date(),
          rejectionReason: body.rejectionReason,
          inspectionStatus: body.inspectionStatus,
          damageNotes: body.damageNotes,
          missingQuantity: body.missingQuantity,
          remarks: body.remarks
        }
      });
      return transitioned;
    }, TX_OPTIONS);
    void safeAudit(actor, body.accepted ? 'delivery.buyer_accepted' : 'delivery.buyer_rejected', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, next, actor, body.remarks || body.rejectionReason);
    return updated;
  },

  async initiateReturn(actor: DeliveryActor, id: number, body: any) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['buyer', 'consignee', 'admin']);
    ensureNotTerminal(delivery);
    const next: DeliveryStatus = body.type === 'REPLACEMENT' ? 'REPLACEMENT_REQUESTED' : 'RETURN_INITIATED';
    const updated = await db.$transaction(tx =>
      transitionStatus(tx, delivery, next, actor, { remarks: body.reason, extra: { type: body.type } })
      , TX_OPTIONS);
    void safeAudit(actor, 'delivery.return_initiated', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, next, actor, body.reason);
    return updated;
  },

  /* ===== Disputes ===== */

  async raiseDispute(actor: DeliveryActor, id: number, body: any) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['buyer', 'seller', 'consignee', 'admin']);
    ensureNotTerminal(delivery);
    if (delivery.status === 'DISPUTE_RAISED') {
      throw new ApiError(409, 'A dispute is already open for this delivery', 'DELIVERY_DISPUTE_OPEN');
    }
    const po = delivery.purchaseOrder;
    const dispute = await db.$transaction(async tx => {
      const created = await tx.dispute.create({
        data: {
          purchaseOrderId: delivery.purchaseOrderId,
          buyerId: po.buyerId,
          sellerId: po.sellerId,
          raisedById: actor.id,
          category: body.category,
          reason: body.reason,
          status: 'open',
          statusEnum: 'OPEN'
        }
      });
      if (Array.isArray(body.evidenceFileAssetIds)) {
        for (const fileAssetId of body.evidenceFileAssetIds) {
          await tx.disputeEvidence.create({
            data: { disputeId: created.id, fileAssetId, uploadedById: actor.id }
          }).catch(() => undefined);
        }
      }
      await transitionStatus(tx, delivery, 'DISPUTE_RAISED', actor, {
        remarks: body.reason,
        extra: { disputeId: created.id, category: body.category }
      });
      return created;
    }, TX_OPTIONS);
    void safeAudit(actor, 'delivery.dispute_raised', 'dispute', dispute.id, { deliveryTrackingId: id });
    void notifyOrderParties(delivery, 'DISPUTE_RAISED', actor, body.reason);
    void notificationService
      .notifyAdminsWithEmail({
        title: `Delivery dispute raised`,
        message: `${body.category}: ${body.reason}`,
        type: DELIVERY_NOTIFICATION_TYPE,
        priority: 'high',
        redirectUrl: `/admin/disputes`
      })
      .catch(() => undefined);
    return dispute;
  },

  async resolveDispute(actor: DeliveryActor, id: number, body: any) {
    if (!isAdmin(actor)) {
      throw new ApiError(403, 'Only admin can resolve a delivery dispute', 'DELIVERY_DISPUTE_ADMIN_ONLY');
    }
    const delivery = await loadDelivery(id);
    if (delivery.status !== 'DISPUTE_RAISED') {
      throw new ApiError(409, 'Delivery is not in DISPUTE_RAISED state', 'DELIVERY_DISPUTE_NOT_OPEN');
    }
    const dispute = await db.dispute.findFirst({
      where: { purchaseOrderId: delivery.purchaseOrderId, status: 'open' },
      orderBy: { createdAt: 'desc' }
    });
    const updated = await db.$transaction(async tx => {
      if (dispute) {
        await tx.dispute.update({
          where: { id: dispute.id },
          data: {
            status: 'resolved',
            statusEnum: 'RESOLVED',
            resolvedById: actor.id,
            resolvedAt: new Date(),
            resolutionRemarks: body.resolutionRemarks
          }
        });
      }
      return transitionStatus(tx, delivery, 'DISPUTE_RESOLVED', actor, {
        remarks: body.resolutionRemarks,
        extra: { outcome: body.outcome, disputeId: dispute?.id }
      });
    }, TX_OPTIONS);
    void safeAudit(actor, 'delivery.dispute_resolved', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, 'DISPUTE_RESOLVED', actor, body.resolutionRemarks);
    return updated;
  },

  /* ===== Finance ===== */

  async verifyInvoice(actor: DeliveryActor, id: number, body: { invoiceId: number; remarks?: string }) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['finance', 'admin']);
    ensureNotTerminal(delivery);
    if (delivery.status !== 'ACCEPTED') {
      throw new ApiError(
        409,
        'Invoice can only be verified after the buyer/consignee has accepted the delivery',
        'DELIVERY_NOT_ACCEPTED'
      );
    }
    const invoice = await db.invoice.findUnique({ where: { id: body.invoiceId } });
    if (!invoice || invoice.purchaseOrderId !== delivery.purchaseOrderId) {
      throw new ApiError(404, 'Invoice does not belong to this delivery', 'DELIVERY_INVOICE_MISMATCH');
    }
    const updated = await db.$transaction(async tx => {
      const transitioned = await transitionStatus(tx, delivery, 'INVOICE_VERIFIED', actor, {
        remarks: body.remarks,
        extra: { invoiceId: body.invoiceId }
      });
      await tx.paymentSettlement.upsert({
        where: { deliveryTrackingId: id },
        create: {
          deliveryTrackingId: id,
          invoiceId: body.invoiceId,
          status: 'INVOICE_VERIFIED',
          invoiceVerifiedAt: new Date(),
          invoiceVerifiedById: actor.id,
          remarks: body.remarks
        },
        update: {
          invoiceId: body.invoiceId,
          status: 'INVOICE_VERIFIED',
          invoiceVerifiedAt: new Date(),
          invoiceVerifiedById: actor.id,
          remarks: body.remarks
        }
      });
      return transitioned;
    }, TX_OPTIONS);
    void safeAudit(actor, 'delivery.invoice_verified', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, 'INVOICE_VERIFIED', actor, body.remarks);
    return updated;
  },

  async paymentDecision(
    actor: DeliveryActor,
    id: number,
    body: {
      approve: boolean;
      rejectionReason?: string;
      deductionAmount?: number;
      penaltyAmount?: number;
      remarks?: string;
    }
  ) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['finance', 'admin']);
    ensureNotTerminal(delivery);
    if (delivery.status !== 'INVOICE_VERIFIED') {
      throw new ApiError(
        409,
        'Payment can only be decided after invoice is verified',
        'DELIVERY_INVOICE_NOT_VERIFIED'
      );
    }
    const next: DeliveryStatus = body.approve ? 'PAYMENT_APPROVED' : 'INVOICE_VERIFIED';
    await db.$transaction(async tx => {
      if (body.approve) {
        await transitionStatus(tx, delivery, next, actor, { remarks: body.remarks });
      }
      await tx.paymentSettlement.update({
        where: { deliveryTrackingId: id },
        data: body.approve
          ? {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedById: actor.id,
            deductionAmount: body.deductionAmount,
            penaltyAmount: body.penaltyAmount,
            remarks: body.remarks
          }
          : {
            status: 'REJECTED',
            rejectedAt: new Date(),
            rejectedById: actor.id,
            rejectionReason: body.rejectionReason,
            remarks: body.remarks
          }
      });
    }, TX_OPTIONS);
    // Fetch the refreshed delivery OUTSIDE the transaction so the heavy include
    // chain doesn't extend the tx window. Crucial on Neon cold starts where a
    // SELECT-with-relations can take 5-10s.
    const updated = body.approve ? await loadDeliveryByPO(delivery.purchaseOrderId) : delivery;
    void safeAudit(actor, body.approve ? 'delivery.payment_approved' : 'delivery.payment_rejected', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, body.approve ? 'PAYMENT_APPROVED' : 'INVOICE_VERIFIED', actor, body.remarks);
    return updated;
  },

  async releasePayment(
    actor: DeliveryActor,
    id: number,
    body: {
      transactionReference: string;
      netReleasedAmount?: number;
      paymentProofFileAssetId?: number;
      remarks?: string;
    }
  ) {
    const delivery = await loadDelivery(id);
    ensureRole(delivery, actor, ['finance', 'admin']);
    ensureNotTerminal(delivery);
    if (delivery.status !== 'PAYMENT_APPROVED') {
      throw new ApiError(
        409,
        'Payment must be approved before release',
        'DELIVERY_PAYMENT_NOT_APPROVED'
      );
    }
    const updated = await db.$transaction(async tx => {
      await tx.paymentSettlement.update({
        where: { deliveryTrackingId: id },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
          releasedById: actor.id,
          transactionReference: body.transactionReference,
          netReleasedAmount: body.netReleasedAmount,
          remarks: body.remarks
        }
      });
      return transitionStatus(tx, delivery, 'PAYMENT_RELEASED', actor, {
        remarks: body.remarks,
        fileAssetId: body.paymentProofFileAssetId,
        extra: { transactionReference: body.transactionReference, netReleasedAmount: body.netReleasedAmount }
      });
    }, TX_OPTIONS);
    // Auto-close delivery once payment is released; CLOSED is terminal.
    const closed = await db.$transaction(tx =>
      transitionStatus(tx, { ...delivery, status: 'PAYMENT_RELEASED' }, 'CLOSED', actor, {
        remarks: 'Order automatically closed after payment release'
      })
      , TX_OPTIONS);
    void safeAudit(actor, 'delivery.payment_released', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, 'PAYMENT_RELEASED', actor, body.remarks);
    return closed || updated;
  },

  /* ===== Admin ===== */

  async adminOverride(actor: DeliveryActor, id: number, body: any) {
    if (!isAdmin(actor)) {
      throw new ApiError(403, 'Only admin can override delivery status', 'DELIVERY_ADMIN_ONLY');
    }
    const delivery = await loadDelivery(id);
    const updated = await db.$transaction(tx =>
      transitionStatus(tx, delivery, body.status, actor, {
        location: body.location,
        remarks: body.reason,
        adminOverride: true,
        extra: { override: true }
      })
      , TX_OPTIONS);
    void safeAudit(actor, 'delivery.admin_override', 'deliveryTracking', id, body);
    void notifyOrderParties(delivery, body.status, actor, body.reason);
    return updated;
  },

  /* ===== Participants ===== */

  async assignParticipant(actor: DeliveryActor, id: number, body: any) {
    if (!isAdmin(actor)) {
      const delivery = await loadDelivery(id);
      const accessRole = ensureAccess(delivery, actor);
      if (!['admin', 'buyer'].includes(accessRole) && !(accessRole === 'seller' && body.participantRole === 'LOGISTICS_PARTNER')) {
        throw new ApiError(403, 'Only admin/buyer can assign participants', 'DELIVERY_ASSIGN_FORBIDDEN');
      }
    } else {
      await loadDelivery(id);
    }
    const user = await db.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    const participant = await db.deliveryParticipant.upsert({
      where: {
        deliveryParticipantCompound: {
          deliveryTrackingId: id,
          userId: body.userId,
          participantRole: body.participantRole
        }
      },
      create: {
        deliveryTrackingId: id,
        userId: body.userId,
        participantRole: body.participantRole,
        assignedById: actor.id,
        notes: body.notes
      },
      update: {
        isActive: true,
        assignedById: actor.id,
        assignedAt: new Date(),
        removedAt: null,
        notes: body.notes
      }
    });
    void safeAudit(actor, 'delivery.participant_assigned', 'deliveryParticipant', participant.id, body);
    return participant;
  },

  async removeParticipant(actor: DeliveryActor, id: number, participantId: number) {
    const delivery = await loadDelivery(id);
    if (!isAdmin(actor)) {
      const accessRole = resolveAccessRole(delivery, actor);
      if (accessRole !== 'buyer') {
        throw new ApiError(403, 'Only admin/buyer can remove participants', 'DELIVERY_REMOVE_FORBIDDEN');
      }
    }
    const participant = await db.deliveryParticipant.update({
      where: { id: participantId },
      data: { isActive: false, removedAt: new Date() }
    });
    void safeAudit(actor, 'delivery.participant_removed', 'deliveryParticipant', participantId);
    return participant;
  },

  /* ===== Logistics Partners ===== */

  async listLogisticsPartners() {
    return db.logisticsPartner.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  },

  async createLogisticsPartner(actor: DeliveryActor, body: any) {
    if (!isAdmin(actor)) {
      throw new ApiError(403, 'Only admin can create logistics partners', 'DELIVERY_LOGISTICS_ADMIN_ONLY');
    }
    const partner = await db.logisticsPartner.create({ data: body });
    void safeAudit(actor, 'delivery.logistics_partner_created', 'logisticsPartner', partner.id, body);
    return partner;
  },

  /* ===== Reports ===== */

  async report(actor: DeliveryActor, query: any) {
    if (!isAdmin(actor)) {
      throw new ApiError(403, 'Admin access required for reports', 'REPORT_ADMIN_ONLY');
    }
    const where: any = {};
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) (where.createdAt as any).gte = new Date(query.fromDate);
      if (query.toDate) (where.createdAt as any).lte = new Date(query.toDate);
    }
    if (query.sellerId) where.purchaseOrder = { sellerId: query.sellerId };
    if (query.buyerId) where.purchaseOrder = { ...(where.purchaseOrder || {}), buyerId: query.buyerId };
    if (query.status) where.status = query.status;

    const [total, statusGroups, delayed] = await Promise.all([
      db.deliveryTracking.count({ where }),
      db.deliveryTracking.groupBy({ by: ['status'], where, _count: true }),
      db.deliveryTracking.count({
        where: {
          ...where,
          status: { notIn: ['DELIVERED', 'ACCEPTED', 'CLOSED', 'CANCELLED'] },
          expectedDelivery: { lt: new Date() }
        }
      })
    ]);

    const byStatus: Record<string, number> = {};
    for (const group of statusGroups) {
      byStatus[group.status] = (group as any)._count?._all ?? (group as any)._count ?? 0;
    }

    return {
      total,
      delayed,
      byStatus,
      pending: byStatus.CREATED || 0,
      delivered: byStatus.DELIVERED || 0,
      accepted: byStatus.ACCEPTED || 0,
      rejected: byStatus.REJECTED || 0,
      returned: byStatus.RETURNED || 0,
      paymentPendingAfterAcceptance:
        (byStatus.ACCEPTED || 0) + (byStatus.INVOICE_VERIFIED || 0) + (byStatus.PAYMENT_APPROVED || 0),
      disputed: byStatus.DISPUTE_RAISED || 0,
      slaBreaches: delayed
    };
  }
};

export type DeliveryService = typeof deliveryService;
