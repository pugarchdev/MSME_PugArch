/**
 * OrgApprovalBanner — persistent top banner shown to users whose organisation
 * has not yet been approved by the platform admin.
 *
 * Three states:
 *   1. No organisation linked at all → "You're not in an organisation yet"
 *      banner with a Create Organisation CTA.
 *   2. Org exists but verificationStatus is PENDING/UNDER_REVIEW/etc. →
 *      tells the user they have read-only access until approved.
 *   3. Org VERIFIED → banner hidden.
 */
import { useEffect } from 'react';
import { AlertTriangle, Clock, XCircle } from 'lucide-react';
import { useOrgRole } from '../hooks/useOrgRole';
import { useAuth } from '../hooks/useAuth';
import { getSellerPortalPath } from '../lib/shg';

export function OrgApprovalBanner() {
    const { user } = useAuth();
    const { orgStatus, isApproved, loading, reload } = useOrgRole();

    // Poll status while not approved and organization exists
    useEffect(() => {
        if (!user || user.role === 'admin' || isApproved || !orgStatus?.organization) {
            return;
        }

        const interval = setInterval(() => {
            reload();
        }, 15000); // Poll every 15 seconds

        return () => clearInterval(interval);
    }, [user, isApproved, orgStatus?.organization, reload]);

    // Platform admins and unloaded states don't show the banner
    if (!user || user.role === 'admin' || loading) return null;

    // 1. No organisation linked yet — return null (we no longer show the manual create banner/dialog)
    if (!orgStatus?.organization) {
        return null;
    }

    if (isApproved) return null;

    const status = orgStatus.organization.verificationStatus;
    const orgName = orgStatus.organization.organizationName;

    const config = {
        PENDING: {
            icon: Clock,
            bg: 'bg-amber-50 border-amber-200',
            text: 'text-amber-800',
            iconColor: 'text-amber-600',
            title: 'Organisation Pending Approval',
            message: `${orgName} is awaiting platform verification. You have read-only access until approved.`
        },
        UNDER_REVIEW: {
            icon: Clock,
            bg: 'bg-blue-50 border-blue-200',
            text: 'text-blue-800',
            iconColor: 'text-blue-600',
            title: 'Under Review',
            message: `${orgName} is currently under compliance review. You have read-only access.`
        },
        MANUAL_REVIEW_REQUIRED: {
            icon: AlertTriangle,
            bg: 'bg-orange-50 border-orange-200',
            text: 'text-orange-800',
            iconColor: 'text-orange-600',
            title: 'Manual Review Required',
            message: `${orgName} requires manual review. Our team will contact you shortly.`
        },
        REJECTED: {
            icon: XCircle,
            bg: 'bg-red-50 border-red-200',
            text: 'text-red-800',
            iconColor: 'text-red-600',
            title: 'Organisation Rejected',
            message: `${orgName} was not approved. Please contact support or resubmit your application.`
        },
        SUSPENDED: {
            icon: XCircle,
            bg: 'bg-red-50 border-red-200',
            text: 'text-red-800',
            iconColor: 'text-red-600',
            title: 'Organisation Suspended',
            message: `${orgName} has been suspended. Contact support for assistance.`
        }
    } as const;

    const cfg = config[status as keyof typeof config] || config.PENDING;
    const Icon = cfg.icon;

    return (
        <div className={`w-full border-b px-4 py-2.5 ${cfg.bg}`}>
            <div className="mx-auto flex max-w-7xl items-center gap-3">
                <Icon className={`h-4 w-4 shrink-0 ${cfg.iconColor}`} />
                <div className="flex-1 min-w-0">
                    <span className={`text-xs font-black uppercase tracking-wider ${cfg.text}`}>
                        {cfg.title}
                    </span>
                    <span className={`ml-2 text-xs font-semibold ${cfg.text}`}>
                        {cfg.message}
                    </span>
                </div>
                <a
                    href={user.role === 'seller' ? getSellerPortalPath(user) : '/buyer/onboarding'}
                    className={`shrink-0 rounded-md border px-3 py-1 text-[10px] font-black uppercase tracking-wider transition hover:opacity-80 ${cfg.text} border-current`}
                >
                    View Status
                </a>
            </div>
        </div>
    );
}
