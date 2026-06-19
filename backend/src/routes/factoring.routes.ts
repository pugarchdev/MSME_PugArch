import { Router, type Response } from 'express';
import prisma from '../config/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { apiResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { z } from 'zod';

const router = Router();

// Input Validation Schemas
const requestFactoringSchema = z.object({
  invoiceId: z.number().int().positive(),
  requestedAmount: z.number().positive(),
});

const submitOfferSchema = z.object({
  discountRate: z.number().min(0).max(100),
  feeAmount: z.number().min(0),
});

/**
 * GET /api/factoring/eligible
 * Fetch invoices approved for payment that have not yet been factored
 */
router.get('/factoring/eligible', authenticate, authorize('seller', 'financier', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
    const isSeller = req.user?.role === 'seller';

    const where: any = {
      OR: [
        { status: 'approved' },
        { invoiceStatus: 'APPROVED' }
      ],
      factoring: null
    };

    if (isSeller) {
      where.sellerId = req.user?.id;
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          seller: { select: { id: true, name: true, email: true } },
          buyer: { select: { id: true, name: true, email: true } },
          purchaseOrder: { select: { poNumber: true, title: true } }
        }
      }),
      prisma.invoice.count({ where })
    ]);

    return apiResponse.success(res, { items: invoices, total, page, pageSize });
  } catch (error: any) {
    return apiResponse.error(res, 500, error.message || 'Failed to fetch eligible invoices', 'INTERNAL_SERVER_ERROR');
  }
});

/**
 * GET /api/factoring/requests
 * Fetch factoring requests, filtered by role
 */
router.get('/factoring/requests', authenticate, authorize('seller', 'financier', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
    const isSeller = req.user?.role === 'seller';

    const where: any = {};
    if (isSeller) {
      where.sellerId = req.user?.id;
    }

    const [requests, total] = await Promise.all([
      prisma.invoiceFactoring.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          invoice: {
            include: {
              purchaseOrder: { select: { poNumber: true, title: true } },
              buyer: { select: { id: true, name: true, email: true } },
              seller: { select: { id: true, name: true, email: true } }
            }
          },
          seller: { select: { id: true, name: true, email: true } },
          financier: { select: { id: true, name: true, email: true } }
        }
      }),
      prisma.invoiceFactoring.count({ where })
    ]);

    return apiResponse.success(res, { items: requests, total, page, pageSize });
  } catch (error: any) {
    return apiResponse.error(res, 500, error.message || 'Failed to fetch factoring requests', 'INTERNAL_SERVER_ERROR');
  }
});

/**
 * POST /api/factoring/request
 * Seller requests early payment for an approved invoice
 */
router.post('/factoring/request', authenticate, authorize('seller'), async (req: AuthRequest, res: Response) => {
  try {
    const parseResult = requestFactoringSchema.safeParse(req.body);
    if (!parseResult.success) {
      return apiResponse.error(res, 400, 'Invalid request body parameters', 'VALIDATION_ERROR', parseResult.error.format());
    }

    const { invoiceId, requestedAmount } = parseResult.data;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      return apiResponse.error(res, 404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    }

    if (invoice.sellerId !== req.user?.id) {
      return apiResponse.error(res, 403, 'Unauthorized access to this invoice', 'FORBIDDEN');
    }

    if (invoice.status !== 'approved' && invoice.invoiceStatus !== 'APPROVED') {
      return apiResponse.error(res, 400, 'Only approved invoices are eligible for early payment factoring', 'INVALID_STATE');
    }

    try {
      const factoring = await prisma.invoiceFactoring.create({
        data: {
          invoiceId,
          sellerId: req.user.id,
          status: 'INITIATED',
          requestedAmount
        },
        include: {
          invoice: { select: { invoiceNumber: true, amount: true } }
        }
      });

      return apiResponse.created(res, factoring, 'Invoice factoring request submitted');
    } catch (err: any) {
      if (err.code === 'P2002') {
        return apiResponse.error(res, 409, 'Factoring has already been requested for this invoice', 'DUPLICATE_REQUEST');
      }
      throw err;
    }
  } catch (error: any) {
    return apiResponse.error(res, 500, error.message || 'Failed to initiate factoring request', 'INTERNAL_SERVER_ERROR');
  }
});

/**
 * POST /api/factoring/requests/:id/offer
 * Financier submits discount rate and fee offer for a factoring request
 */
router.post('/factoring/requests/:id/offer', authenticate, authorize('financier'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return apiResponse.error(res, 400, 'Invalid factoring request ID', 'VALIDATION_ERROR');
    }

    const parseResult = submitOfferSchema.safeParse(req.body);
    if (!parseResult.success) {
      return apiResponse.error(res, 400, 'Invalid offer details', 'VALIDATION_ERROR', parseResult.error.format());
    }

    const { discountRate, feeAmount } = parseResult.data;

    // Use transaction with lock/find for safe state mutation
    const updated = await prisma.$transaction(async (tx) => {
      const request = await tx.invoiceFactoring.findUnique({
        where: { id },
        include: { invoice: true }
      });

      if (!request) {
        throw new Error('NOT_FOUND');
      }

      if (request.status !== 'INITIATED' && request.status !== 'OFFERED') {
        throw new Error('INVALID_STATUS');
      }

      const invoiceAmount = Number(request.invoice.amount);
      const discountRateDecimal = discountRate / 100;
      const factoredAmount = invoiceAmount * (1 - discountRateDecimal) - feeAmount;
      const repaymentAmount = invoiceAmount;

      return tx.invoiceFactoring.update({
        where: { id },
        data: {
          status: 'OFFERED',
          financierId: req.user?.id,
          discountRate,
          feeAmount,
          factoredAmount,
          repaymentAmount
        },
        include: {
          invoice: { select: { invoiceNumber: true, amount: true } },
          financier: { select: { id: true, name: true } }
        }
      });
    });

    return apiResponse.success(res, updated, 200, 'Offer submitted successfully');
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return apiResponse.error(res, 404, 'Factoring request not found', 'REQUEST_NOT_FOUND');
    }
    if (error.message === 'INVALID_STATUS') {
      return apiResponse.error(res, 400, 'Offers can only be submitted for pending factoring requests', 'INVALID_STATE');
    }
    return apiResponse.error(res, 500, error.message || 'Failed to submit offer', 'INTERNAL_SERVER_ERROR');
  }
});

/**
 * POST /api/factoring/requests/:id/accept
 * Seller accepts the financier's factoring offer
 */
router.post('/factoring/requests/:id/accept', authenticate, authorize('seller'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return apiResponse.error(res, 400, 'Invalid factoring request ID', 'VALIDATION_ERROR');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const request = await tx.invoiceFactoring.findUnique({
        where: { id }
      });

      if (!request) {
        throw new Error('NOT_FOUND');
      }

      if (request.sellerId !== req.user?.id) {
        throw new Error('UNAUTHORIZED');
      }

      if (request.status !== 'OFFERED') {
        throw new Error('INVALID_STATUS');
      }

      return tx.invoiceFactoring.update({
        where: { id },
        data: {
          status: 'ACCEPTED'
        }
      });
    });

    return apiResponse.success(res, updated, 200, 'Factoring offer accepted');
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return apiResponse.error(res, 404, 'Factoring request not found', 'REQUEST_NOT_FOUND');
    }
    if (error.message === 'UNAUTHORIZED') {
      return apiResponse.error(res, 403, 'You do not own this factoring request', 'FORBIDDEN');
    }
    if (error.message === 'INVALID_STATUS') {
      return apiResponse.error(res, 400, 'Only pending offers can be accepted', 'INVALID_STATE');
    }
    return apiResponse.error(res, 500, error.message || 'Failed to accept offer', 'INTERNAL_SERVER_ERROR');
  }
});

/**
 * POST /api/factoring/requests/:id/disburse
 * Financier approves and marks early payout as disbursed/completed to vendor
 */
router.post('/factoring/requests/:id/disburse', authenticate, authorize('financier'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return apiResponse.error(res, 400, 'Invalid factoring request ID', 'VALIDATION_ERROR');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const request = await tx.invoiceFactoring.findUnique({
        where: { id }
      });

      if (!request) {
        throw new Error('NOT_FOUND');
      }

      if (request.financierId !== req.user?.id) {
        throw new Error('UNAUTHORIZED');
      }

      if (request.status !== 'ACCEPTED') {
        throw new Error('INVALID_STATUS');
      }

      return tx.invoiceFactoring.update({
        where: { id },
        data: {
          status: 'DISBURSED'
        }
      });
    });

    return apiResponse.success(res, updated, 200, 'Payout disbursed to vendor');
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return apiResponse.error(res, 404, 'Factoring request not found', 'REQUEST_NOT_FOUND');
    }
    if (error.message === 'UNAUTHORIZED') {
      return apiResponse.error(res, 403, 'You are not authorized to disburse this request', 'FORBIDDEN');
    }
    if (error.message === 'INVALID_STATUS') {
      return apiResponse.error(res, 400, 'Disbursement can only occur for accepted factoring offers', 'INVALID_STATE');
    }
    return apiResponse.error(res, 500, error.message || 'Failed to disburse payment', 'INTERNAL_SERVER_ERROR');
  }
});

export { router as factoringRoutes };
export default router;
