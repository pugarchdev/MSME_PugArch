/**
 * Delivery Tracking Module - HTTP routes.
 *
 * All routes are mounted at /api/delivery and /api/purchase-orders/:id/delivery
 * by routes/index.ts. Authorization is handled inside the service: routes here
 * only enforce authentication and validate input shape.
 */

import { Router, type Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { shortCache, longCache } from '../../middleware/httpCache.js';
import { handleSecureRouteError } from '../../utils/routeHelpers.js';
import { maskSensitive } from '../../utils/maskSensitive.js';
import {
  adminOverrideBody,
  buyerAcceptanceBody,
  createDeliveryBody,
  deliveryListQuery,
  deliveryReportQuery,
  dispatchDetailsBody,
  documentUploadBody,
  idParam,
  invoiceVerifyBody,
  logisticsPartnerBody,
  packingBody,
  participantAssignBody,
  paymentDecisionBody,
  paymentReleaseBody,
  purchaseOrderIdParam,
  returnRequestBody,
  sellerAcceptanceBody,
  sellerRejectionBody,
  statusUpdateBody,
  disputeRaiseBody,
  disputeResolveBody
} from './delivery.validation.js';
import { deliveryService, type DeliveryActor } from './delivery.service.js';

const router = Router();

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json(maskSensitive({ success: true, data }));

const parse = <T,>(schema: ZodTypeAny, value: unknown): T => schema.parse(value) as T;

const actorFrom = (req: AuthRequest): DeliveryActor => ({
  id: Number(req.user?.id),
  role: String(req.user?.role || ''),
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'] || undefined
});

const wrap =
  (handler: (req: AuthRequest, res: Response) => Promise<unknown>, fallback = 'Unable to complete request') =>
    async (req: AuthRequest, res: Response) => {
      try {
        await handler(req, res);
      } catch (error) {
        return handleSecureRouteError(res, error, fallback);
      }
    };

/* ============== Listing & detail ============== */

router.get('/', authenticate, shortCache(15), wrap(async (req, res) => {
  const query = parse<any>(deliveryListQuery, req.query);
  const result = await deliveryService.listForActor(actorFrom(req), query);
  ok(res, result);
}));

router.get('/reports/summary', authenticate, shortCache(30), wrap(async (req, res) => {
  const query = parse<any>(deliveryReportQuery, req.query);
  const summary = await deliveryService.report(actorFrom(req), query);
  ok(res, summary);
}));

router.get('/logistics-partners', authenticate, longCache(120), wrap(async (_req, res) => {
  const partners = await deliveryService.listLogisticsPartners();
  ok(res, partners);
}));

router.post('/logistics-partners', authenticate, wrap(async (req, res) => {
  const body = parse<any>(logisticsPartnerBody, req.body);
  const partner = await deliveryService.createLogisticsPartner(actorFrom(req), body);
  ok(res, partner, 201);
}));

router.get('/by-purchase-order/:purchaseOrderId', authenticate, wrap(async (req, res) => {
  const { purchaseOrderId } = parse<any>(purchaseOrderIdParam, req.params);
  const delivery = await deliveryService.getByPurchaseOrder(actorFrom(req), purchaseOrderId);
  ok(res, delivery);
}));

router.post('/by-purchase-order/:purchaseOrderId', authenticate, wrap(async (req, res) => {
  const { purchaseOrderId } = parse<any>(purchaseOrderIdParam, req.params);
  const body = parse<any>(createDeliveryBody, req.body || {});
  const delivery = await deliveryService.ensureDeliveryForPO(actorFrom(req), purchaseOrderId, body);
  ok(res, delivery, 201);
}));

router.get('/:id', authenticate, shortCache(15), wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const delivery = await deliveryService.getDetail(actorFrom(req), id);
  ok(res, delivery);
}));

router.get('/:id/timeline', authenticate, shortCache(15), wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const timeline = await deliveryService.getTimeline(actorFrom(req), id);
  ok(res, timeline);
}));

router.get('/:id/documents', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const documents = await deliveryService.listDocuments(actorFrom(req), id);
  ok(res, documents);
}));

router.post('/:id/documents', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(documentUploadBody, req.body);
  const document = await deliveryService.addDocument(actorFrom(req), id, body);
  ok(res, document, 201);
}));

/* ============== Seller actions ============== */

router.post('/:id/seller/accept', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(sellerAcceptanceBody, req.body || {});
  const delivery = await deliveryService.sellerAccept(actorFrom(req), id, body);
  ok(res, delivery);
}));

router.post('/:id/seller/reject', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(sellerRejectionBody, req.body);
  const delivery = await deliveryService.sellerReject(actorFrom(req), id, body);
  ok(res, delivery);
}));

router.post('/:id/seller/packed', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(packingBody, req.body || {});
  const delivery = await deliveryService.setPacked(actorFrom(req), id, body);
  ok(res, delivery);
}));

router.put('/:id/seller/dispatch-details', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(dispatchDetailsBody, req.body || {});
  const delivery = await deliveryService.updateDispatchDetails(actorFrom(req), id, body);
  ok(res, delivery);
}));

router.post('/:id/seller/ready-for-pickup', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const delivery = await deliveryService.markReadyForPickup(actorFrom(req), id, req.body || {});
  ok(res, delivery);
}));

router.post('/:id/seller/dispatched', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const delivery = await deliveryService.markDispatched(actorFrom(req), id, req.body || {});
  ok(res, delivery);
}));

/* ============== Logistics actions ============== */

router.post('/:id/logistics/status', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(statusUpdateBody, req.body);
  const delivery = await deliveryService.logisticsStatusUpdate(actorFrom(req), id, body);
  ok(res, delivery);
}));

/* ============== Buyer / consignee actions ============== */

router.post('/:id/buyer/acceptance', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(buyerAcceptanceBody, req.body);
  const delivery = await deliveryService.buyerOrConsigneeAccept(actorFrom(req), id, body);
  ok(res, delivery);
}));

router.post('/:id/buyer/return', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(returnRequestBody, req.body);
  const delivery = await deliveryService.initiateReturn(actorFrom(req), id, body);
  ok(res, delivery);
}));

/* ============== Disputes ============== */

router.post('/:id/dispute', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(disputeRaiseBody, req.body);
  const dispute = await deliveryService.raiseDispute(actorFrom(req), id, body);
  ok(res, dispute, 201);
}));

router.post('/:id/dispute/resolve', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(disputeResolveBody, req.body);
  const delivery = await deliveryService.resolveDispute(actorFrom(req), id, body);
  ok(res, delivery);
}));

/* ============== Finance ============== */

router.post('/:id/finance/verify-invoice', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(invoiceVerifyBody, req.body);
  const delivery = await deliveryService.verifyInvoice(actorFrom(req), id, body);
  ok(res, delivery);
}));

router.post('/:id/finance/payment-decision', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(paymentDecisionBody, req.body);
  const delivery = await deliveryService.paymentDecision(actorFrom(req), id, body);
  ok(res, delivery);
}));

router.post('/:id/finance/release-payment', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(paymentReleaseBody, req.body);
  const delivery = await deliveryService.releasePayment(actorFrom(req), id, body);
  ok(res, delivery);
}));

/* ============== Admin override ============== */

router.post('/admin/backfill', authenticate, wrap(async (req, res) => {
  const result = await deliveryService.backfillDeliveriesForExistingPOs(actorFrom(req));
  ok(res, result);
}));

router.post('/:id/admin/override', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(adminOverrideBody, req.body);
  const delivery = await deliveryService.adminOverride(actorFrom(req), id, body);
  ok(res, delivery);
}));

/* ============== Participants ============== */

router.post('/:id/participants', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, req.params);
  const body = parse<any>(participantAssignBody, req.body);
  const participant = await deliveryService.assignParticipant(actorFrom(req), id, body);
  ok(res, participant, 201);
}));

router.delete('/:id/participants/:participantId', authenticate, wrap(async (req, res) => {
  const { id } = parse<any>(idParam, { id: req.params.id });
  const participantId = Number(req.params.participantId);
  if (!Number.isFinite(participantId) || participantId <= 0) {
    return handleSecureRouteError(
      res,
      Object.assign(new Error('Invalid participantId'), { statusCode: 400 }),
      'Invalid participant id'
    );
  }
  const participant = await deliveryService.removeParticipant(actorFrom(req), id, participantId);
  ok(res, participant);
}));

export default router;
