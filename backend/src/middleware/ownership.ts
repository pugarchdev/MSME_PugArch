import type { NextFunction, Request, Response } from 'express';
import prisma from '../config/prisma.js';
import { apiResponse } from '../utils/apiResponse.js';

export type OwnedEntityType =
  | 'tender'
  | 'bid'
  | 'vendor'
  | 'quote'
  | 'sellerOffice'
  | 'sellerBankAccount'
  | 'user';

export const requireSelfOrAdmin = (paramName = 'userId') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    if (req.user.role === 'admin') return next();

    const requestedUserId = Number(req.params[paramName] || req.body?.[paramName] || req.query?.[paramName]);
    if (requestedUserId !== Number(req.user.id)) {
      return apiResponse.error(res, 403, 'Resource ownership check failed', 'OWNERSHIP_DENIED');
    }

    return next();
  };
};

export const checkOwnership = async (
  entityType: OwnedEntityType,
  entityId: number,
  user: { id: number; role: string },
  options: { allowAdmin?: boolean } = { allowAdmin: true }
) => {
  if (options.allowAdmin !== false && user.role === 'admin') return true;

  if (entityType === 'tender') {
    const tender = await prisma.tender.findUnique({ where: { id: entityId }, select: { buyerId: true, status: true } });
    return Boolean(tender && (tender.buyerId === user.id || (user.role === 'seller' && ['published', 'bid_submission'].includes(String(tender.status)))));
  }

  if (entityType === 'bid') {
    const bid = await prisma.bid.findUnique({
      where: { id: entityId },
      select: { sellerId: true, tender: { select: { buyerId: true } } }
    });
    return Boolean(bid && (bid.sellerId === user.id || bid.tender.buyerId === user.id));
  }

  if (entityType === 'vendor') {
    const vendor = await prisma.user.findUnique({ where: { id: entityId }, select: { role: true, onboardingStatus: true } });
    return Boolean(user.role === 'buyer' && vendor?.role === 'seller' && vendor.onboardingStatus === 'approved_for_procurement');
  }

  if (entityType === 'quote') {
    const quote = await prisma.quoteRequest.findUnique({ where: { id: entityId }, select: { buyerId: true, sellerId: true } });
    return Boolean(quote && (quote.buyerId === user.id || quote.sellerId === user.id));
  }

  if (entityType === 'sellerOffice') {
    const office = await prisma.sellerOffice.findUnique({
      where: { id: entityId },
      select: { sellerProfile: { select: { userId: true } } }
    });
    return office?.sellerProfile.userId === user.id;
  }

  if (entityType === 'sellerBankAccount') {
    const bank = await prisma.sellerBankAccount.findUnique({
      where: { id: entityId },
      select: { sellerProfile: { select: { userId: true } } }
    });
    return bank?.sellerProfile.userId === user.id;
  }

  if (entityType === 'user') return entityId === user.id;

  return false;
};

export const requireOwnership = (
  entityType: OwnedEntityType,
  paramName = 'id',
  options: { allowAdmin?: boolean } = { allowAdmin: true }
) => async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');

  const entityId = Number(req.params[paramName] || req.body?.[paramName] || req.query?.[paramName]);
  if (!entityId) return apiResponse.error(res, 400, 'Invalid resource id', 'INVALID_RESOURCE_ID');

  const allowed = await checkOwnership(entityType, entityId, req.user, options);
  if (!allowed) return apiResponse.error(res, 404, 'Resource not found', 'RESOURCE_NOT_FOUND');

  return next();
};
