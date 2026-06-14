import { OrgRole, OrganizationType } from '@prisma/client';
import prisma from '../config/prisma.js';
import { ensureOrgMembership } from './org-membership.service.js';

const ORGANIZATION_TYPES = new Set(Object.values(OrganizationType));

type ApprovalResult = {
  user: any;
  organization: {
    id: number;
    organizationName: string;
    organizationType: OrganizationType;
    verificationStatus: string;
    organizationOnboardingStatus: string | null;
  };
  membership: {
    id: number;
    userId: number;
    organizationId: number;
    orgRole: OrgRole;
    isActive: boolean;
    acceptedAt: Date | null;
  };
  createdOrganization: boolean;
  createdMembership: boolean;
};

const clean = (value: unknown) => String(value ?? '').trim();
const first = (...values: unknown[]) => values.map(clean).find(Boolean) || '';

const normalizeOrganizationType = (value: unknown, fallback: OrganizationType) => {
  const raw = clean(value).toUpperCase().replace(/[\s-]+/g, '_');
  if (ORGANIZATION_TYPES.has(raw as OrganizationType)) return raw as OrganizationType;
  if (raw.includes('GOVERNMENT') || raw === 'GOVT') return OrganizationType.GOVERNMENT;
  if (raw.includes('PSU') || raw.includes('PUBLIC_SECTOR')) return OrganizationType.PSU;
  if (raw.includes('PRIVATE')) return OrganizationType.PRIVATE_LIMITED;
  if (raw.includes('PUBLIC')) return OrganizationType.PUBLIC_LIMITED;
  if (raw.includes('LLP')) return OrganizationType.LLP;
  if (raw.includes('PARTNER')) return OrganizationType.PARTNERSHIP;
  if (raw.includes('PROPRIET')) return OrganizationType.PROPRIETORSHIP;
  if (raw.includes('STARTUP')) return OrganizationType.STARTUP;
  if (raw.includes('MSME') || raw.includes('MICRO') || raw.includes('SMALL') || raw.includes('MEDIUM')) return OrganizationType.MSME;
  return fallback;
};

const organizationNameFor = (user: any) => {
  if (user.role === 'buyer') {
    return first(
      user.buyerProfile?.organizationName,
      user.registrationDetails?.organizationName,
      user.registrationDetails?.businessName,
      user.name
    );
  }
  return first(
    user.sellerProfile?.businessName,
    user.sellerProfile?.nameAsInPan,
    user.registrationDetails?.businessName,
    user.registrationDetails?.organizationName,
    user.name
  );
};

const organizationDataFor = (user: any) => {
  const primaryOffice = user.sellerProfile?.offices?.find((office: any) => office.isMandatory) || user.sellerProfile?.offices?.[0] || null;
  const organizationName = organizationNameFor(user);

  if (user.role === 'buyer') {
    const profile = user.buyerProfile || {};
    return {
      organizationName,
      organizationType: normalizeOrganizationType(profile.organizationTypeEnum || profile.organizationType || profile.businessType, OrganizationType.GOVERNMENT),
      addressLine1: first(profile.registeredAddress, profile.corporateAddress) || null,
      city: first(profile.city) || null,
      district: first(profile.district) || null,
      state: first(profile.state) || null,
      pincode: first(profile.pincode) || null,
      website: first(profile.website) || null,
      verificationStatus: 'VERIFIED' as const,
      organizationOnboardingStatus: 'approved_for_procurement'
    };
  }

  const profile = user.sellerProfile || {};
  return {
    organizationName,
    organizationType: normalizeOrganizationType(profile.organizationTypeEnum || profile.organizationType || profile.msmeType, OrganizationType.MSME),
    addressLine1: first(primaryOffice?.address) || null,
    city: first(primaryOffice?.city) || null,
    district: null,
    state: first(primaryOffice?.state) || null,
    pincode: first(primaryOffice?.pincode) || null,
    website: null,
    verificationStatus: 'VERIFIED' as const,
    organizationOnboardingStatus: 'approved_for_procurement'
  };
};

const selectSafeOrganization = {
  id: true,
  organizationName: true,
  organizationType: true,
  verificationStatus: true,
  organizationOnboardingStatus: true
};

export async function approveOnboardingAndEnsureOrganization(userId: number, updateData: Record<string, unknown>): Promise<ApprovalResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: userId },
      include: {
        buyerProfile: true,
        sellerProfile: {
          include: {
            offices: true,
            bankAccounts: { select: { id: true, isPrimary: true, isVerified: true } },
            sellerDocuments: { select: { id: true, verificationStatus: true } }
          }
        },
        organization: { select: selectSafeOrganization }
      }
    });

    if (!existing) throw new Error('User not found');
    if (!['buyer', 'seller'].includes(String(existing.role))) {
      throw new Error('Organization auto-creation is only available for buyer and seller onboarding approvals');
    }

    const orgData = organizationDataFor(existing);
    if (!orgData.organizationName) {
      throw new Error('Organization name is required before approving onboarding');
    }

    let organization = existing.organization;
    let createdOrganization = false;

    if (organization) {
      organization = await tx.organization.update({
        where: { id: organization.id },
        data: {
          organizationName: organization.organizationName || orgData.organizationName,
          organizationType: organization.organizationType || orgData.organizationType,
          addressLine1: orgData.addressLine1,
          city: orgData.city,
          district: orgData.district,
          state: orgData.state,
          pincode: orgData.pincode,
          website: orgData.website,
          verificationStatus: 'VERIFIED' as any,
          organizationOnboardingStatus: 'approved_for_procurement'
        },
        select: selectSafeOrganization
      });
    } else {
      const duplicate = await tx.organization.findFirst({
        where: {
          deletedAt: null,
          organizationName: { equals: orgData.organizationName, mode: 'insensitive' }
        },
        select: selectSafeOrganization
      });

      if (duplicate) {
        organization = await tx.organization.update({
          where: { id: duplicate.id },
          data: {
            verificationStatus: 'VERIFIED' as any,
            organizationOnboardingStatus: 'approved_for_procurement'
          },
          select: selectSafeOrganization
        });
      } else {
        organization = await tx.organization.create({
          data: {
            organizationName: orgData.organizationName,
            organizationType: orgData.organizationType,
            addressLine1: orgData.addressLine1,
            city: orgData.city,
            district: orgData.district,
            state: orgData.state,
            pincode: orgData.pincode,
            website: orgData.website,
            verificationStatus: 'VERIFIED' as any,
            organizationOnboardingStatus: 'approved_for_procurement'
          },
          select: selectSafeOrganization
        });
        createdOrganization = true;
      }
    }

    const previousMembership = await tx.orgMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId: organization.id } },
      select: { id: true }
    });

    const user = await tx.user.update({
      where: { id: userId },
      data: { ...updateData, organizationId: organization.id },
      include: { organization: { select: selectSafeOrganization } }
    });

    if (user.role === 'buyer') {
      await tx.buyerProfile.updateMany({
        where: { userId },
        data: { organizationId: organization.id, verificationStatusEnum: 'VERIFIED' as any }
      });
    } else {
      await tx.sellerProfile.updateMany({
        where: { userId },
        data: { organizationId: organization.id, verificationStatusEnum: 'VERIFIED' as any }
      });
    }

    const membership = await ensureOrgMembership({
      userId,
      organizationId: organization.id,
      desiredRole: OrgRole.ORG_ADMIN,
      upgrade: true,
      client: tx as any
    });

    return {
      user,
      organization,
      membership: {
        id: membership.id,
        userId: membership.userId,
        organizationId: membership.organizationId,
        orgRole: membership.orgRole,
        isActive: membership.isActive,
        acceptedAt: membership.acceptedAt
      },
      createdOrganization,
      createdMembership: !previousMembership
    };
  }, { timeout: 20_000 });
}
