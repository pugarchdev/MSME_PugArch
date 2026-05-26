/**
 * useOrgRole — provides the current user's intra-organisation role and
 * organisation approval status. Used throughout the app to gate UI elements.
 *
 * OrgRole hierarchy (most → least privileged):
 *   ORG_ADMIN > PROCUREMENT_OFFICER > FINANCE_OFFICER > TECHNICAL_OFFICER > LOGISTICS_OFFICER > VIEWER
 */
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { getApi } from '../features/shared/apiClient';

export type OrgRole =
    | 'ORG_ADMIN'
    | 'PROCUREMENT_OFFICER'
    | 'FINANCE_OFFICER'
    | 'TECHNICAL_OFFICER'
    | 'LOGISTICS_OFFICER'
    | 'VIEWER';

export interface OrgStatus {
    organization: {
        id: number;
        organizationName: string;
        verificationStatus: string;
        organizationOnboardingStatus?: string;
    } | null;
    membership: {
        orgRole: OrgRole;
        isActive: boolean;
        acceptedAt?: string;
    } | null;
    isApproved: boolean;
}

interface UseOrgRoleReturn {
    orgRole: OrgRole | null;
    orgStatus: OrgStatus | null;
    isApproved: boolean;
    isOrgAdmin: boolean;
    isProcurementOfficer: boolean;
    isFinanceOfficer: boolean;
    isTechnicalOfficer: boolean;
    isLogisticsOfficer: boolean;
    isViewer: boolean;
    /** True if user can perform write/transactional actions */
    canTransact: boolean;
    /** True if user has at least the given role in the hierarchy */
    hasMinRole: (minRole: OrgRole) => boolean;
    loading: boolean;
    reload: () => void;
}

const ROLE_HIERARCHY: Record<OrgRole, number> = {
    ORG_ADMIN: 6,
    PROCUREMENT_OFFICER: 5,
    FINANCE_OFFICER: 4,
    TECHNICAL_OFFICER: 3,
    LOGISTICS_OFFICER: 2,
    VIEWER: 1
};

export function useOrgRole(): UseOrgRoleReturn {
    const { user, token } = useAuth();
    const [orgStatus, setOrgStatus] = useState<OrgStatus | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!token || !user) return;
        // Platform admins don't have org roles
        if (user.role === 'admin') return;
        setLoading(true);
        try {
            const data = await getApi<OrgStatus>('/api/org/status');
            setOrgStatus(data);
        } catch {
            // Non-fatal — user may not have an org yet
        } finally {
            setLoading(false);
        }
    }, [token, user]);

    useEffect(() => {
        void load();
    }, [load]);

    const orgRole = orgStatus?.membership?.orgRole ?? null;
    const isApproved = orgStatus?.isApproved ?? false;

    const hasMinRole = (minRole: OrgRole): boolean => {
        if (!orgRole) return false;
        return ROLE_HIERARCHY[orgRole] >= ROLE_HIERARCHY[minRole];
    };

    return {
        orgRole,
        orgStatus,
        isApproved,
        isOrgAdmin: orgRole === 'ORG_ADMIN',
        isProcurementOfficer: orgRole === 'PROCUREMENT_OFFICER' || orgRole === 'ORG_ADMIN',
        isFinanceOfficer: orgRole === 'FINANCE_OFFICER' || orgRole === 'ORG_ADMIN',
        isTechnicalOfficer: orgRole === 'TECHNICAL_OFFICER' || orgRole === 'ORG_ADMIN',
        isLogisticsOfficer: orgRole === 'LOGISTICS_OFFICER' || orgRole === 'ORG_ADMIN',
        isViewer: orgRole === 'VIEWER',
        canTransact: isApproved && orgRole !== null && orgRole !== 'VIEWER',
        hasMinRole,
        loading,
        reload: load
    };
}
