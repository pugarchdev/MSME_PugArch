import { Router, type Response } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { apiResponse } from '../../utils/apiResponse.js';
import type { AuthRequest } from '../../middleware/authenticate.js';
import { auditLog } from '../audit/audit.service.js';
import { numberSeries } from '../../services/workflow/workflow-common.js';
import { getProcurementModeSettings } from '../procurementMode/procurement-mode.service.js';

const router = Router();
router.use(authenticate);

const asyncRoute = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  async (req: AuthRequest, res: Response) => {
    try {
      await handler(req, res);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string };
      const status = e?.statusCode || 500;
      return apiResponse.error(res, status, status < 500 ? e.message || 'Request failed' : 'Unable to complete request', e?.code || 'REQUEST_FAILED');
    }
  };

const ensureOrgPoAccess = async (poId: number, userId: number, organizationId: number, role: string) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new ApiError(404, 'Purchase order not found.', 'NOT_FOUND');
  if (role === 'seller' && po.sellerId !== userId) throw new ApiError(403, 'Forbidden.', 'FORBIDDEN');
  if (role === 'buyer' && po.buyerId !== userId) {
    const buyer = await prisma.user.findFirst({ where: { id: userId, organizationId } });
    if (!buyer || po.buyerId !== userId) throw new ApiError(403, 'Forbidden.', 'FORBIDDEN');
  }
  return po;
};

router.post(
  '/prc',
  asyncRoute(async (req, res) => {
    const orgId = req.user!.organizationId;
    if (!orgId) throw new ApiError(400, 'Organisation required.', 'ORG_REQUIRED');

    const body = z.object({
      purchaseOrderId: z.number().int().positive(),
      grnId: z.number().int().positive().optional(),
      receivedQuantity: z.number().positive(),
      remarks: z.string().max(1000).optional(),
    }).parse(req.body);

    await ensureOrgPoAccess(body.purchaseOrderId, req.user!.id, orgId, req.user!.role);

    const prc = await prisma.provisionalReceiptCertificate.create({
      data: {
        prcNumber: numberSeries('PRC'),
        purchaseOrderId: body.purchaseOrderId,
        grnId: body.grnId,
        generatedById: req.user!.id,
        receivedQuantity: body.receivedQuantity,
        remarks: body.remarks,
      },
    });

    await auditLog({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: 'prc.generated',
      entityType: 'prc',
      entityId: prc.id,
      metadata: { purchaseOrderId: body.purchaseOrderId, grnId: body.grnId },
    });

    return res.status(201).json({ success: true, data: prc });
  })
);

router.post(
  '/crac',
  asyncRoute(async (req, res) => {
    const orgId = req.user!.organizationId;
    if (!orgId) throw new ApiError(400, 'Organisation required.', 'ORG_REQUIRED');

    const body = z.object({
      purchaseOrderId: z.number().int().positive(),
      prcId: z.number().int().positive().optional(),
      grnId: z.number().int().positive().optional(),
      inspectionResult: z.string().min(1),
      acceptedQuantity: z.number().nonnegative(),
      rejectedQuantity: z.number().nonnegative().optional(),
      acceptanceRemarks: z.string().min(1),
      rejectionReason: z.string().optional(),
      installationCompleted: z.boolean().optional(),
      warrantyDocumentId: z.number().int().positive().optional(),
    }).parse(req.body);

    if (body.inspectionResult === 'REJECTED' && !body.rejectionReason) {
      throw new ApiError(400, 'Rejection reason required when inspection is rejected.', 'VALIDATION_ERROR');
    }

    await ensureOrgPoAccess(body.purchaseOrderId, req.user!.id, orgId, req.user!.role);

    const crac = await prisma.consigneeReceiptAcceptanceCertificate.create({
      data: {
        cracNumber: numberSeries('CRAC'),
        purchaseOrderId: body.purchaseOrderId,
        prcId: body.prcId,
        grnId: body.grnId,
        generatedById: req.user!.id,
        inspectionResult: body.inspectionResult,
        acceptedQuantity: body.acceptedQuantity,
        rejectedQuantity: body.rejectedQuantity,
        acceptanceRemarks: body.acceptanceRemarks,
        rejectionReason: body.rejectionReason,
        installationCompleted: body.installationCompleted,
        warrantyDocumentId: body.warrantyDocumentId,
      },
    });

    await auditLog({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: 'crac.generated',
      entityType: 'crac',
      entityId: crac.id,
      metadata: { purchaseOrderId: body.purchaseOrderId },
    });

    return res.status(201).json({ success: true, data: crac });
  })
);

router.get(
  '/orders/:orderId/receipt-chain',
  asyncRoute(async (req, res) => {
    const orgId = req.user!.organizationId!;
    const orderId = parseInt(req.params.orderId, 10);
    await ensureOrgPoAccess(orderId, req.user!.id, orgId, req.user!.role);

    const [grns, prcs, cracs] = await Promise.all([
      prisma.goodsReceiptNote.findMany({ where: { purchaseOrderId: orderId }, orderBy: { createdAt: 'desc' } }),
      prisma.provisionalReceiptCertificate.findMany({ where: { purchaseOrderId: orderId }, orderBy: { createdAt: 'desc' } }),
      prisma.consigneeReceiptAcceptanceCertificate.findMany({ where: { purchaseOrderId: orderId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const settings = await getProcurementModeSettings(orgId);
    const invoiceEligible = cracs.some(c => c.status === 'GENERATED' && c.inspectionResult !== 'REJECTED')
      || (settings.allowLegacyGrnInvoiceGate && grns.some(g => ['APPROVED', 'PARTIAL'].includes(g.status)));

    return res.json({ success: true, data: { grns, prcs, cracs, invoiceEligible } });
  })
);

export default router;
