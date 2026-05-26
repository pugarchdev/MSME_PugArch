/**
 * Organisation Team Management Routes
 *
 * POST   /api/org/invite                  — ORG_ADMIN sends invite
 * GET    /api/org/invitations             — List pending invitations
 * DELETE /api/org/invitations/:id         — Cancel invitation
 * POST   /api/org/accept-invite           — Accept invite by token
 * GET    /api/org/members                 — List all members
 * PUT    /api/org/members/:userId/role    — Change member OrgRole
 * DELETE /api/org/members/:userId         — Remove member
 * GET    /api/org/me                      — My membership info
 * GET    /api/org/status                  — Org approval status (for banner)
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import { OrgRole } from '@prisma/client';
import prisma from '../config/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/requireOrgRole.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { notificationService } from '../services/notification.service.js';
import { transporter } from '../services/mail.service.js';
import { env } from '../config/env.js';
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
            return apiResponse.error(res, status, message, err?.code || 'REQUEST_FAILED');
        }
    };

const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json({ success: true, data });

const userId = (req: AuthRequest) => req.user!.id;
const orgId = (req: AuthRequest) => req.user!.organizationId!;

const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 48 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const ORG_ROLE_VALUES = Object.values(OrgRole);

const inviteSchema = z.object({
    email: z.string().email().toLowerCase().trim(),
    orgRole: z.enum(ORG_ROLE_VALUES as [string, ...string[]])
});

const roleUpdateSchema = z.object({
    orgRole: z.enum(ORG_ROLE_VALUES as [string, ...string[]])
});

// ─── GET /api/org/status — org approval status for banner ────────────────────
router.get('/org/status', authenticate, asyncRoute(async (req, res) => {
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
router.get('/org/me', authenticate, asyncRoute(async (req, res) => {
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

export default router;
