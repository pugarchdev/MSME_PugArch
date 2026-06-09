/**
 * Organisation Team Management Routes
 *
 * POST   /api/org/invite                  — ORG_ADMIN sends invite
 * GET    /api/org/invitations             — List pending invitations
 * DELETE /api/org/invitations/:id         — Cancel invitation
 * GET    /api/org/invite/info             — (public) Look up invite by token
 * POST   /api/org/invite/signup           — (public) Create account from invite + join org
 * POST   /api/org/accept-invite           — Accept invite by token
 * GET    /api/org/members                 — List all members
 * PUT    /api/org/members/:userId/role    — Change member OrgRole
 * DELETE /api/org/members/:userId         — Remove member
 * GET    /api/org/me                      — My membership info
 * GET    /api/org/status                  — Org approval status (for banner)
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import { OrgRole, Role } from '@prisma/client';
import prisma from '../config/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/requireOrgRole.js';
import { shortCache } from '../middleware/httpCache.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { notificationService } from '../services/notification.service.js';
import { ensureOrgMembership } from '../services/org-membership.service.js';
import { transporter } from '../services/mail.service.js';
import { env } from '../config/env.js';
import { hashPassword, validatePasswordStrength } from '../services/password.service.js';
import { issueAuthResponse } from '../services/token.service.js';
import { toSafeUser } from '../utils/routeHelpers.js';
import type { AuthRequest } from '../middleware/authenticate.js';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const asyncRoute = (
    handler: (req: AuthRequest, res: Response) => Promise<unknown>
) =>
    async (req: AuthRequest, res: Response) => {
        try {
            await handler(req, res);
        } catch (err: any) {
            const status = err?.statusCode || 500;
            const message = status < 500 ? err.message : 'Unable to complete request';
            // Log the actual error for diagnosis. Without this we lose Prisma /
            // database errors entirely and the frontend just sees a 500.
            if (status >= 500) {
                console.error('[org.routes] Unhandled error:', {
                    path: req.originalUrl,
                    method: req.method,
                    userId: req.user?.id,
                    orgId: req.user?.organizationId,
                    code: err?.code,
                    name: err?.name,
                    message: err?.message,
                    stack: err?.stack
                });
            }
            return apiResponse.error(res, status, message, err?.code || 'REQUEST_FAILED');
        }
    };

const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json({ success: true, data });

const userId = (req: AuthRequest) => req.user!.id;
const orgId = (req: AuthRequest) => req.user!.organizationId!;
const activePoStatuses = ['generated', 'issued', 'accepted', 'in_fulfillment', 'GENERATED', 'ISSUED', 'ACCEPTED', 'IN_FULFILLMENT'];
const pendingInvoiceStatuses = ['draft', 'submitted', 'under_review', 'approved', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED'];
const openTenderStatuses = ['published', 'bid_submission'];
const activeDeliveryTerminalStatuses = ['DELIVERED', 'COMPLETED', 'CANCELLED', 'CLOSED'];
const activeQuotationStatuses = ['pending', 'submitted', 'technical_qualified', 'financial_evaluated', 'modified', 'accepted', 'PENDING', 'SUBMITTED', 'TECHNICAL_QUALIFIED', 'FINANCIAL_EVALUATED', 'MODIFIED', 'ACCEPTED'];
const activeQuoteRequestStatuses = ['pending', 'sent', 'responded', 'PENDING', 'SENT', 'RESPONDED'];
const publicProcurementBidStatuses = ['OPEN', 'APPROVED', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'];

const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 48 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const ORG_ROLE_VALUES = Object.values(OrgRole);

const ORGANIZATION_TYPE_VALUES = [
    'MSME', 'PROPRIETORSHIP', 'PARTNERSHIP', 'PRIVATE_LIMITED',
    'PUBLIC_LIMITED', 'LLP', 'TRUST', 'SOCIETY', 'STARTUP',
    'NGO', 'EDUCATIONAL_INSTITUTION', 'GOVERNMENT', 'PSU'
] as const;

const inviteSchema = z.object({
    email: z.string().email().toLowerCase().trim(),
    orgRole: z.enum(ORG_ROLE_VALUES as [string, ...string[]])
});

const inviteSignupSchema = z.object({
    token: z.string().min(10),
    name: z.string().trim().min(2).max(120),
    password: z.string().min(1),
    mobile: z.string().trim().min(7).max(20).optional()
});

const roleUpdateSchema = z.object({
    orgRole: z.enum(ORG_ROLE_VALUES as [string, ...string[]])
});

const createOrgWithoutGstSchema = z.object({
    organizationName: z.string().min(2).max(200).trim(),
    organizationType: z.enum(ORGANIZATION_TYPE_VALUES as unknown as [string, ...string[]]),
    city: z.string().max(120).trim().optional(),
    state: z.string().max(120).trim().optional(),
    pincode: z.string().max(20).trim().optional(),
    addressLine1: z.string().max(255).trim().optional()
});

// ─── GET /api/org/status — org approval status for banner ────────────────────
router.get('/org/status', authenticate, shortCache(30), asyncRoute(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: userId(req) },
        select: {
            organizationId: true,
            organization: {
                select: {
                    id: true,
                    organizationName: true,
                    verificationStatus: true,
                    organizationOnboardingStatus: true
                }
            }
        }
    });

    const membership = user?.organizationId
        ? await prisma.orgMembership.findUnique({
            where: { userId_organizationId: { userId: userId(req), organizationId: user.organizationId } },
            select: { orgRole: true, isActive: true }
        })
        : null;

    ok(res, {
        organization: user?.organization || null,
        membership: membership || null,
        isApproved: user?.organization?.verificationStatus === 'VERIFIED'
    });
}));

// ─── GET /api/org/me — my membership ─────────────────────────────────────────
router.get('/org/me', authenticate, shortCache(30), asyncRoute(async (req, res) => {
    if (!req.user?.organizationId) {
        return ok(res, { membership: null, organization: null });
    }

    const [membership, org] = await Promise.all([
        prisma.orgMembership.findUnique({
            where: { userId_organizationId: { userId: userId(req), organizationId: orgId(req) } },
            select: { orgRole: true, isActive: true, invitedAt: true, acceptedAt: true }
        }),
        prisma.organization.findUnique({
            where: { id: orgId(req) },
            select: {
                id: true,
                organizationName: true,
                organizationType: true,
                verificationStatus: true,
                gstin: true,
                city: true,
                state: true
            }
        })
    ]);

    ok(res, { membership, organization: org });
}));

// ─── GET /api/dashboard/summary — unified dashboard counts ───────────────────
// Returns all counts the dashboard cards need in ONE call instead of 5.
router.get('/dashboard/summary', authenticate, shortCache(15), asyncRoute(async (req, res) => {
    if (!req.user) return ok(res, null);
    if (req.user.role === 'admin') return ok(res, { isAdmin: true });

    const orgId = req.user.organizationId;
    const userIdNum = req.user.id;

    // Get the user's OrgRole once so we can filter. Users without an
    // organisation still receive role-based dashboard counts below.
    const membership = orgId ? await prisma.orgMembership.findUnique({
        where: { userId_organizationId: { userId: userIdNum, organizationId: orgId } },
        select: { orgRole: true, isActive: true }
    }) : null;
    const orgRole = membership?.isActive ? membership.orgRole : null;

    // Determine which approval stages this role can decide
    const stages: string[] = [];
    if (orgRole === 'PROCUREMENT_OFFICER' || orgRole === 'ORG_ADMIN') stages.push('DEPARTMENT_HEAD');
    if (orgRole === 'FINANCE_OFFICER' || orgRole === 'ORG_ADMIN') stages.push('FINANCE_DEPT');
    if (orgRole === 'ORG_ADMIN') stages.push('PROCUREMENT_HEAD');

    const isBuyer = req.user.role === 'buyer';
    const isSeller = req.user.role === 'seller';
    const buyerRecordWhere = orgId
        ? { OR: [{ buyerId: userIdNum }, { buyer: { organizationId: orgId } }] }
        : { buyerId: userIdNum };
    const sellerRecordWhere = orgId
        ? { OR: [{ sellerId: userIdNum }, { seller: { organizationId: orgId } }] }
        : { sellerId: userIdNum };
    const buyerTenderWhere = orgId
        ? { OR: [{ buyerId: userIdNum }, { organizationId: orgId }] }
        : { buyerId: userIdNum };
    const sellerCatalogueWhere = orgId
        ? { OR: [{ sellerId: userIdNum }, { organizationId: orgId }] }
        : { sellerId: userIdNum };

    const [
        activeCart,
        pendingApprovals,
        cartApprovals,
        techReview,
        grnsToApprove,
        activeDeliveries,
        // Buyer-facing core counts
        myTenders,
        myActivePOs,
        myPendingInvoices,
        myRfqs,
        // Seller-facing core counts
        sellerOpenTenders,
        sellerActivePOs,
        sellerCatalogueItems,
        sellerPendingInvoices,
        sellerTenderQuotations,
        sellerReceivedRfqs,
        sellerLiveProcurementBids,
        sellerProcurementParticipations
    ] = await Promise.all([
            // cart item count
            orgId
                ? prisma.cart.findFirst({
                    where: { organizationId: orgId, status: 'ACTIVE' },
                    select: { _count: { select: { items: true } } }
                })
                : Promise.resolve(null),
            // pending approvals — filter by stages if user can decide them, else 0
            stages.length > 0
                ? prisma.procurementApproval.count({
                    where: {
                        organizationId: orgId as number,
                        stage: { in: stages as any },
                        decision: { in: ['PENDING', 'SENT_FOR_CLARIFICATION'] }
                    }
                })
                : Promise.resolve(0),
            // carts pending finance approval
            (orgRole === 'FINANCE_OFFICER' || orgRole === 'ORG_ADMIN')
                ? prisma.cart.count({
                    where: { organizationId: orgId as number, status: 'SUBMITTED_FOR_APPROVAL' }
                })
                : Promise.resolve(0),
            // tech review queue
            (orgRole === 'TECHNICAL_OFFICER' || orgRole === 'ORG_ADMIN')
                ? prisma.cartItem.count({
                    where: {
                        cart: { organizationId: orgId as number, status: 'SUBMITTED_FOR_APPROVAL' },
                        technicalApproved: null
                    }
                })
                : Promise.resolve(0),
            // GRNs awaiting approval
            orgId
                ? prisma.goodsReceiptNote.count({
                    where: { organizationId: orgId, status: 'SUBMITTED' }
                })
                : Promise.resolve(0),
            // active deliveries (only useful for sellers)
            isSeller
                ? prisma.deliveryTracking.count({
                    where: {
                        purchaseOrder: sellerRecordWhere,
                        status: { notIn: activeDeliveryTerminalStatuses as any }
                    }
                })
                : Promise.resolve(0),
            // ─── Buyer baseline counts (visible to every buyer) ───
            isBuyer
                ? prisma.tender.count({ where: buyerTenderWhere }).catch(() => 0)
                : Promise.resolve(0),
            isBuyer
                ? prisma.purchaseOrder.count({
                    where: { ...buyerRecordWhere, status: { in: activePoStatuses } }
                }).catch(() => 0)
                : Promise.resolve(0),
            isBuyer
                ? prisma.invoice.count({
                    where: { ...buyerRecordWhere, status: { in: pendingInvoiceStatuses } }
                }).catch(() => 0)
                : Promise.resolve(0),
            isBuyer
                ? prisma.quoteRequest.count({ where: { ...buyerRecordWhere, status: { in: activeQuoteRequestStatuses } } }).catch(() => 0)
                : Promise.resolve(0),
            // ─── Seller baseline counts ───
            isSeller
                ? prisma.tender.count({
                    where: {
                        status: { in: openTenderStatuses as any },
                        OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }]
                    }
                }).catch(() => 0)
                : Promise.resolve(0),
            isSeller
                ? prisma.purchaseOrder.count({
                    where: { ...sellerRecordWhere, status: { in: activePoStatuses } }
                }).catch(() => 0)
                : Promise.resolve(0),
            isSeller
                ? prisma.product.count({ where: { ...sellerCatalogueWhere, status: 'ACTIVE' as any } })
                    .then(p => prisma.service.count({ where: { ...sellerCatalogueWhere, status: 'ACTIVE' as any } })
                        .then(s => p + s).catch(() => p))
                    .catch(() => 0)
                : Promise.resolve(0),
            isSeller
                ? prisma.invoice.count({
                    where: { ...sellerRecordWhere, status: { in: pendingInvoiceStatuses } }
                }).catch(() => 0)
                : Promise.resolve(0),
            isSeller
                ? prisma.bid.count({
                    where: { ...sellerRecordWhere, status: { in: activeQuotationStatuses } }
                }).catch(() => 0)
                : Promise.resolve(0),
            isSeller
                ? prisma.quoteRequest.count({ where: { ...sellerRecordWhere, status: { in: activeQuoteRequestStatuses } } }).catch(() => 0)
                : Promise.resolve(0),
            isSeller
                ? (prisma as any).procurementBid.count({
                    where: {
                        approvalStatus: 'APPROVED',
                        status: { in: publicProcurementBidStatuses },
                        OR: [{ endDate: null }, { endDate: { gt: new Date() } }]
                    }
                }).catch(() => 0)
                : Promise.resolve(0),
            isSeller
                ? (prisma as any).procurementBidParticipation.count({
                    where: orgId
                        ? { OR: [{ sellerId: userIdNum }, { seller: { organizationId: orgId } }] }
                        : { sellerId: userIdNum }
                }).catch(() => 0)
                : Promise.resolve(0)
    ]);

    const summaryData = {
        cartItemCount: activeCart?._count.items || 0,
        pendingApprovalsCount: pendingApprovals,
        cartApprovalsCount: cartApprovals,
        techReviewCount: techReview,
        grnsToApproveCount: grnsToApprove,
        activeDeliveriesCount: activeDeliveries,
        // Buyer-side
        myTendersCount: myTenders,
        myActivePOsCount: myActivePOs,
        myPendingInvoicesCount: myPendingInvoices,
        myRfqsCount: myRfqs,
        // Seller-side
        sellerOpenTendersCount: sellerOpenTenders + sellerLiveProcurementBids,
        sellerActivePOsCount: sellerActivePOs,
        sellerCatalogueItemsCount: sellerCatalogueItems,
        sellerPendingInvoicesCount: sellerPendingInvoices,
        sellerQuotationsCount: sellerTenderQuotations + sellerReceivedRfqs + sellerProcurementParticipations,
        orgRole
    };

    ok(res, summaryData);
}));

// ─── GET /api/org/members — list all members ─────────────────────────────────
router.get(
    '/org/members',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        if (!req.user?.organizationId) throw new ApiError(400, 'No organisation linked', 'ORG_REQUIRED');

        const members = await prisma.orgMembership.findMany({
            where: { organizationId: orgId(req) },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        mobile: true,
                        accountStatus: true,
                        lastLoginAt: true,
                        createdAt: true
                    }
                },
                invitedBy: { select: { id: true, name: true, email: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        ok(res, members);
    })
);

// ─── GET /api/org/invitations — list pending invitations ─────────────────────
router.get(
    '/org/invitations',
    authenticate,
    authorize('buyer', 'seller'),
    requireOrgRole('ORG_ADMIN'),
    asyncRoute(async (req, res) => {
        const invitations = await prisma.orgInvitation.findMany({
            where: { organizationId: orgId(req), acceptedAt: null, expiresAt: { gt: new Date() } },
            include: { invitedBy: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: 'desc' }
        });
        ok(res, invitations);
    })
);

// ─── POST /api/org/invite — send invitation ───────────────────────────────────
router.post(
    '/org/invite',
    authenticate,
    authorize('buyer', 'seller'),
    requireOrgRole('ORG_ADMIN'),
    asyncRoute(async (req, res) => {
        const body = inviteSchema.parse(req.body);

        // Check if user already a member
        const existingUser = await prisma.user.findUnique({
            where: { email: body.email },
            select: { id: true, organizationId: true }
        });

        if (existingUser?.organizationId === orgId(req)) {
            throw new ApiError(409, 'This user is already a member of your organisation.', 'ALREADY_MEMBER');
        }

        // Check for existing pending invite
        const existingInvite = await prisma.orgInvitation.findFirst({
            where: { organizationId: orgId(req), email: body.email, acceptedAt: null, expiresAt: { gt: new Date() } }
        });
        if (existingInvite) {
            throw new ApiError(409, 'A pending invitation already exists for this email.', 'INVITE_EXISTS');
        }

        const org = await prisma.organization.findUnique({
            where: { id: orgId(req) },
            select: { organizationName: true }
        });

        const token = generateToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const invitation = await prisma.orgInvitation.create({
            data: {
                organizationId: orgId(req),
                email: body.email,
                orgRole: body.orgRole as OrgRole,
                token,
                expiresAt,
                invitedById: userId(req)
            }
        });

        // Send invite email
        const inviteUrl = `${env.FRONTEND_URL || 'http://localhost:3000'}/invite/accept?token=${token}`;
        const roleName = body.orgRole.replace(/_/g, ' ');

        try {
            await transporter.sendMail({
                from: `"JsgSmile Portal" <${env.SMTP_USER}>`,
                to: body.email,
                subject: `You're invited to join ${org?.organizationName} on JsgSmile`,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:560px;margin:20px auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                    <div style="background:#12335f;color:white;padding:18px;text-align:center;font-weight:700;">JsgSmile Procurement Portal</div>
                    <div style="padding:28px;color:#1e293b;">
                      <h2 style="margin:0 0 16px;">You've been invited!</h2>
                      <p>You have been invited to join <strong>${org?.organizationName}</strong> as a <strong>${roleName}</strong>.</p>
                      <p>Click the button below to accept the invitation. This link expires in 7 days.</p>
                      <div style="text-align:center;margin:28px 0;">
                        <a href="${inviteUrl}" style="background:#12335f;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Accept Invitation</a>
                      </div>
                      <p style="font-size:12px;color:#64748b;">If you did not expect this invitation, you can safely ignore this email.</p>
                    </div>
                  </div>
                `
            });
        } catch {
            // Email failure is non-fatal — invitation is still created
        }

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'org.invitation.sent',
            entityType: 'orgInvitation',
            entityId: invitation.id,
            ipAddress: req.ip,
            metadata: { email: body.email, orgRole: body.orgRole }
        });

        ok(res, { invitation: { id: invitation.id, email: invitation.email, orgRole: invitation.orgRole, expiresAt: invitation.expiresAt } }, 201);
    })
);

// ─── DELETE /api/org/invitations/:id — cancel invitation ─────────────────────
router.delete(
    '/org/invitations/:id',
    authenticate,
    authorize('buyer', 'seller'),
    requireOrgRole('ORG_ADMIN'),
    asyncRoute(async (req, res) => {
        const id = Number(req.params.id);
        if (!id) throw new ApiError(400, 'Invalid invitation ID', 'INVALID_ID');

        const invite = await prisma.orgInvitation.findFirst({
            where: { id, organizationId: orgId(req) }
        });
        if (!invite) throw new ApiError(404, 'Invitation not found', 'INVITE_NOT_FOUND');
        if (invite.acceptedAt) throw new ApiError(409, 'Invitation already accepted', 'INVITE_ACCEPTED');

        await prisma.orgInvitation.delete({ where: { id } });
        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'org.invitation.cancelled',
            entityType: 'orgInvitation',
            entityId: id,
            ipAddress: req.ip
        });

        ok(res, { success: true });
    })
);

// ─── GET /api/org/invite/info — (public) look up an invite by token ──────────
// Lets an invited person see which organisation and role the invite is for
// BEFORE they have an account. No auth required; only non-sensitive fields are
// returned and the token itself is never echoed back.
router.get(
    '/org/invite/info',
    asyncRoute(async (req, res) => {
        const token = z.string().min(10).parse(req.query.token);

        const invite = await prisma.orgInvitation.findUnique({
            where: { token },
            include: {
                organization: { select: { organizationName: true, organizationType: true } },
                invitedBy: { select: { name: true, role: true } }
            }
        });

        if (!invite) throw new ApiError(404, 'Invitation not found or already used.', 'INVITE_NOT_FOUND');
        if (invite.acceptedAt) throw new ApiError(409, 'This invitation has already been accepted.', 'INVITE_USED');
        if (invite.expiresAt < new Date()) throw new ApiError(410, 'This invitation has expired.', 'INVITE_EXPIRED');

        // Does an account already exist for this email? Drives the frontend
        // decision between "log in to accept" vs "create account to accept".
        const existingUser = await prisma.user.findUnique({
            where: { email: invite.email },
            select: { id: true }
        });

        ok(res, {
            email: invite.email,
            orgRole: invite.orgRole,
            organizationName: invite.organization.organizationName,
            organizationType: invite.organization.organizationType,
            invitedByName: invite.invitedBy?.name || null,
            // The portal role (buyer/seller) the new account must be created as
            // so it matches the inviting organisation's domain.
            portalRole: invite.invitedBy?.role === 'buyer' ? 'buyer' : 'seller',
            expiresAt: invite.expiresAt,
            accountExists: Boolean(existingUser)
        });
    })
);

// ─── POST /api/org/invite/signup — (public) create account from an invite ────
// One-shot path for a brand-new invitee: creates their user account, links it
// to the inviting organisation, and creates the membership with the invited
// OrgRole — all without forcing them through the full GST/org onboarding flow
// (the org already exists and is owned by the inviter). Returns auth tokens so
// the frontend can log them straight in.
router.post(
    '/org/invite/signup',
    asyncRoute(async (req, res) => {
        const body = inviteSignupSchema.parse(req.body);

        const invite = await prisma.orgInvitation.findUnique({
            where: { token: body.token },
            include: {
                organization: { select: { id: true, organizationName: true, verificationStatus: true } },
                invitedBy: { select: { role: true } }
            }
        });

        if (!invite) throw new ApiError(404, 'Invitation not found or already used.', 'INVITE_NOT_FOUND');
        if (invite.acceptedAt) throw new ApiError(409, 'This invitation has already been accepted.', 'INVITE_USED');
        if (invite.expiresAt < new Date()) throw new ApiError(410, 'This invitation has expired.', 'INVITE_EXPIRED');

        // If an account already exists, this is the wrong path — they should
        // log in and accept via /api/org/accept-invite instead.
        const existingUser = await prisma.user.findUnique({
            where: { email: invite.email },
            select: { id: true }
        });
        if (existingUser) {
            throw new ApiError(409, 'An account already exists for this email. Please log in to accept the invitation.', 'ACCOUNT_EXISTS');
        }

        const passwordCheck = validatePasswordStrength(body.password);
        if (!passwordCheck.ok) {
            throw new ApiError(400, passwordCheck.errors[0] || 'Password does not meet security requirements', 'WEAK_PASSWORD');
        }

        if (body.mobile) {
            const mobileTaken = await prisma.user.findFirst({
                where: { mobile: body.mobile },
                select: { id: true }
            });
            if (mobileTaken) throw new ApiError(409, 'Mobile number already in use. Please use unique details.', 'MOBILE_EXISTS');
        }

        // Mirror the inviting admin's portal role so the new member lives in the
        // same domain (seller org → seller account, buyer org → buyer account).
        const portalRole: Role = invite.invitedBy?.role === 'buyer' ? Role.buyer : Role.seller;
        const hashedPassword = await hashPassword(body.password);
        const now = new Date();

        const user = await prisma.$transaction(async (tx) => {
            const created = await tx.user.create({
                data: {
                    name: body.name,
                    email: invite.email,
                    password: hashedPassword,
                    role: portalRole,
                    mobile: body.mobile,
                    emailVerified: true, // the invite email itself proves ownership
                    lastPasswordChangeAt: now,
                    registrationStatus: 'completed',
                    // Team members inherit access from the (already-approved) org;
                    // they don't run their own onboarding/compliance review.
                    onboardingStatus: 'approved_for_procurement',
                    accountStatus: 'ACTIVE',
                    organizationId: invite.organizationId,
                    registrationDetails: {}
                }
            });

            await tx.orgMembership.create({
                data: {
                    userId: created.id,
                    organizationId: invite.organizationId,
                    orgRole: invite.orgRole,
                    isActive: true,
                    invitedById: invite.invitedById,
                    invitedAt: invite.createdAt,
                    acceptedAt: now
                }
            });

            await tx.orgInvitation.update({
                where: { id: invite.id },
                data: { acceptedAt: now }
            });

            return created;
        });

        // Notify the inviter that the invite was accepted.
        try {
            await notificationService.notify(invite.invitedById, {
                title: 'Team member joined',
                message: `${user.email} created an account and joined ${invite.organization.organizationName} as ${invite.orgRole.replace(/_/g, ' ')}.`,
                type: 'org_invite_accepted',
                priority: 'medium',
                redirectUrl: '/org/team'
            });
        } catch { /* non-fatal */ }

        await auditLog({
            actorUserId: user.id,
            actorRole: user.role,
            action: 'org.invitation.accepted_via_signup',
            entityType: 'orgInvitation',
            entityId: invite.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { organizationId: invite.organizationId, orgRole: invite.orgRole }
        });

        const tokens = issueAuthResponse(user);
        ok(res, {
            ...tokens,
            user: toSafeUser(user),
            organizationId: invite.organizationId,
            organizationName: invite.organization.organizationName,
            orgRole: invite.orgRole
        }, 201);
    })
);

// ─── POST /api/org/accept-invite — accept invitation ─────────────────────────
router.post(
    '/org/accept-invite',
    authenticate,
    asyncRoute(async (req, res) => {
        const { token } = z.object({ token: z.string().min(10) }).parse(req.body);

        const invite = await prisma.orgInvitation.findUnique({
            where: { token },
            include: { organization: { select: { id: true, organizationName: true, verificationStatus: true } } }
        });

        if (!invite) throw new ApiError(404, 'Invitation not found or already used.', 'INVITE_NOT_FOUND');
        if (invite.acceptedAt) throw new ApiError(409, 'This invitation has already been accepted.', 'INVITE_USED');
        if (invite.expiresAt < new Date()) throw new ApiError(410, 'This invitation has expired.', 'INVITE_EXPIRED');

        const user = await prisma.user.findUnique({ where: { id: userId(req) }, select: { email: true, organizationId: true } });
        if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

        // Verify email matches invite
        if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
            throw new ApiError(403, 'This invitation was sent to a different email address.', 'INVITE_EMAIL_MISMATCH');
        }

        // Check if already a member
        const existing = await prisma.orgMembership.findUnique({
            where: { userId_organizationId: { userId: userId(req), organizationId: invite.organizationId } }
        });
        if (existing) throw new ApiError(409, 'You are already a member of this organisation.', 'ALREADY_MEMBER');

        // Create membership + update invite + link user to org
        const now = new Date();
        await prisma.$transaction([
            prisma.orgMembership.create({
                data: {
                    userId: userId(req),
                    organizationId: invite.organizationId,
                    orgRole: invite.orgRole,
                    isActive: true,
                    invitedById: invite.invitedById,
                    invitedAt: invite.createdAt,
                    acceptedAt: now
                }
            }),
            prisma.orgInvitation.update({
                where: { id: invite.id },
                data: { acceptedAt: now }
            }),
            prisma.user.update({
                where: { id: userId(req) },
                data: { organizationId: invite.organizationId }
            })
        ]);

        // Notify the inviter
        try {
            await notificationService.notify(invite.invitedById, {
                title: 'Team member joined',
                message: `${user.email} has accepted your invitation and joined ${invite.organization.organizationName} as ${invite.orgRole.replace(/_/g, ' ')}.`,
                type: 'org_invite_accepted',
                priority: 'medium',
                redirectUrl: '/org/team'
            });
        } catch { /* non-fatal */ }

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'org.invitation.accepted',
            entityType: 'orgInvitation',
            entityId: invite.id,
            ipAddress: req.ip,
            metadata: { organizationId: invite.organizationId, orgRole: invite.orgRole }
        });

        ok(res, {
            organizationId: invite.organizationId,
            organizationName: invite.organization.organizationName,
            orgRole: invite.orgRole
        });
    })
);

// ─── PUT /api/org/members/:userId/role — change member role ──────────────────
router.put(
    '/org/members/:memberId/role',
    authenticate,
    authorize('buyer', 'seller'),
    requireOrgRole('ORG_ADMIN'),
    asyncRoute(async (req, res) => {
        const memberId = Number(req.params.memberId);
        if (!memberId) throw new ApiError(400, 'Invalid member ID', 'INVALID_ID');

        const { orgRole } = roleUpdateSchema.parse(req.body);

        // Cannot change own role
        if (memberId === userId(req)) {
            throw new ApiError(409, 'You cannot change your own role.', 'SELF_ROLE_CHANGE');
        }

        const membership = await prisma.orgMembership.findUnique({
            where: { userId_organizationId: { userId: memberId, organizationId: orgId(req) } }
        });
        if (!membership) throw new ApiError(404, 'Member not found in your organisation.', 'MEMBER_NOT_FOUND');

        const updated = await prisma.orgMembership.update({
            where: { userId_organizationId: { userId: memberId, organizationId: orgId(req) } },
            data: { orgRole: orgRole as OrgRole }
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'org.member.role_changed',
            entityType: 'orgMembership',
            entityId: updated.id,
            ipAddress: req.ip,
            metadata: { memberId, newRole: orgRole }
        });

        ok(res, { id: updated.id, userId: memberId, orgRole: updated.orgRole });
    })
);

// ─── DELETE /api/org/members/:userId — remove member ─────────────────────────
router.delete(
    '/org/members/:memberId',
    authenticate,
    authorize('buyer', 'seller'),
    requireOrgRole('ORG_ADMIN'),
    asyncRoute(async (req, res) => {
        const memberId = Number(req.params.memberId);
        if (!memberId) throw new ApiError(400, 'Invalid member ID', 'INVALID_ID');

        if (memberId === userId(req)) {
            throw new ApiError(409, 'You cannot remove yourself from the organisation.', 'SELF_REMOVE');
        }

        const membership = await prisma.orgMembership.findUnique({
            where: { userId_organizationId: { userId: memberId, organizationId: orgId(req) } }
        });
        if (!membership) throw new ApiError(404, 'Member not found in your organisation.', 'MEMBER_NOT_FOUND');

        await prisma.orgMembership.update({
            where: { userId_organizationId: { userId: memberId, organizationId: orgId(req) } },
            data: { isActive: false }
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'org.member.removed',
            entityType: 'orgMembership',
            entityId: membership.id,
            ipAddress: req.ip,
            metadata: { memberId }
        });

        ok(res, { success: true });
    })
);

// ─── POST /api/org/create-without-gst — self-create org without GST ──────────
// Allows a buyer/seller user with NO organisation linked yet to create a
// minimal Organization record (name + type + optional address) and become
// its ORG_ADMIN. The new org is created with verificationStatus=PENDING so
// the user has read-only access to most flows but can still use the cart
// and other org-aware features. Platform admins approve via the onboarding
// queue exactly like the GST-verified path.
router.post(
    '/org/create-without-gst',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        const body = createOrgWithoutGstSchema.parse(req.body);

        const me = await prisma.user.findUnique({
            where: { id: userId(req) },
            select: { id: true, organizationId: true, name: true, email: true, role: true }
        });
        if (!me) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
        if (me.organizationId) {
            throw new ApiError(409, 'You are already linked to an organisation. Leave it before creating a new one.', 'ALREADY_HAS_ORG');
        }

        // Reject duplicate names (case-insensitive) so users don't accidentally
        // spawn parallel orgs. Stricter dedup happens during platform review.
        const dupe = await prisma.organization.findFirst({
            where: { organizationName: { equals: body.organizationName, mode: 'insensitive' }, deletedAt: null },
            select: { id: true }
        });
        if (dupe) {
            throw new ApiError(409, 'An organisation with this name already exists. Use a unique name or ask the existing admin to invite you.', 'ORG_NAME_TAKEN');
        }

        const org = await prisma.$transaction(async (tx) => {
            const created = await tx.organization.create({
                data: {
                    organizationName: body.organizationName,
                    organizationType: body.organizationType as any,
                    addressLine1: body.addressLine1 || null,
                    city: body.city || null,
                    state: body.state || null,
                    pincode: body.pincode || null,
                    verificationStatus: 'PENDING' as any,
                    organizationOnboardingStatus: 'self_created'
                }
            });
            await tx.user.update({
                where: { id: me.id },
                data: { organizationId: created.id }
            });
            await tx.orgMembership.create({
                data: {
                    userId: me.id,
                    organizationId: created.id,
                    orgRole: OrgRole.ORG_ADMIN,
                    isActive: true,
                    invitedAt: new Date(),
                    acceptedAt: new Date()
                }
            });
            return created;
        });

        await auditLog({
            actorUserId: me.id,
            actorRole: req.user!.role,
            action: 'org.created.self',
            entityType: 'organization',
            entityId: org.id,
            ipAddress: req.ip,
            metadata: {
                organizationName: org.organizationName,
                organizationType: org.organizationType,
                source: 'self_created'
            }
        });

        ok(res, {
            organization: {
                id: org.id,
                organizationName: org.organizationName,
                organizationType: org.organizationType,
                verificationStatus: org.verificationStatus
            },
            orgRole: 'ORG_ADMIN'
        }, 201);
    })
);

export default router;
