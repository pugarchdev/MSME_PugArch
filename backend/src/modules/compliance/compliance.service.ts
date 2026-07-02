import prisma from '../../config/prisma.js';
import { maskSensitive } from '../../utils/maskSensitive.js';
import { createHashFingerprint, sha256 } from '../../utils/crypto.js';
import { normalizeSpaces } from '../../utils/sanitize.js';
import { logger } from '../../config/logger.js';


export type ComplianceFlagInput = {
  userId?: number | null;
  type: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'open' | 'resolved' | 'dismissed';
  description: string;
  metadata?: Record<string, unknown>;
};

export const createComplianceFlag = async (input: ComplianceFlagInput) => {
  const metadata = input.metadata ? maskSensitive(input.metadata) : undefined;
  
  let ruleId: number | null = null;
  try {
    const typeToRuleCodeMap: Record<string, string> = {
      'duplicate_pan': 'DUPLICATE_IDENTIFIER',
      'duplicate_gst': 'DUPLICATE_IDENTIFIER',
      'duplicate_aadhaar_hash': 'DUPLICATE_IDENTIFIER',
      'duplicate_bank_account': 'DUPLICATE_IDENTIFIER',
      'same_ip_multiple_sellers_bidding': 'SUSPICIOUS_REGISTRATION',
      'similar_price_seconds_apart': 'SUSPICIOUS_REGISTRATION',
      'suspicious_lowball_bid': 'SUSPICIOUS_REGISTRATION',
      'sudden_bid_withdrawal_pattern': 'SUSPICIOUS_REGISTRATION',
      'same_ip_multiple_sellers_auction': 'SUSPICIOUS_REGISTRATION',
      'KYC_PAN_REQUIRED': 'KYC_PAN_REQUIRED',
      'GSTIN_FORMAT_CHECK': 'GSTIN_FORMAT_CHECK',
      'BANK_ACCOUNT_DUPLICATE': 'BANK_ACCOUNT_DUPLICATE',
      'BID_DEADLINE_ENFORCEMENT': 'BID_DEADLINE_ENFORCEMENT',
      'MISSING_REQUIRED_DOCUMENT': 'MISSING_REQUIRED_DOCUMENT',
      'EXPIRED_CERTIFICATE': 'EXPIRED_CERTIFICATE',
      'INVALID_GST': 'INVALID_GST',
      'INVALID_PAN': 'INVALID_PAN',
      'INVALID_BANK': 'INVALID_BANK',
      'POLICY_VIOLATION': 'POLICY_VIOLATION'
    };
    const ruleCode = typeToRuleCodeMap[input.type] || input.type.toUpperCase();
    const rule = await prisma.complianceRule.findFirst({
      where: {
        OR: [
          { code: ruleCode },
          { code: input.type }
        ]
      }
    });
    if (rule) {
      ruleId = rule.id;
    }
  } catch (err) {
    console.error('[Compliance] Failed to resolve ruleId for flag:', err);
  }

  return prisma.complianceViolation.create({
    data: {
      userId: input.userId || null,
      type: input.type,
      severity: input.severity || 'medium',
      status: input.status || 'open',
      description: input.description,
      metadata: metadata as any,
      ruleId
    }
  });
};

export const hashIdentifier = (value: unknown) => {
  const normalized = normalizeSpaces(value).toUpperCase();
  return normalized ? sha256(normalized) : '';
};

export const flagDuplicateSellerIdentifiers = async (payload: {
  userId: number;
  pan?: string;
  gstNumbers?: string[];
  aadhaarNumber?: string;
}) => {
  try {
    const dupRule = await prisma.complianceRule.findUnique({ where: { code: 'DUPLICATE_IDENTIFIER' } });
    if (dupRule && !dupRule.isActive) {
      logger.info('[Compliance] Skipping duplicate identifier checks because DUPLICATE_IDENTIFIER rule is inactive.');
      return [];
    }
  } catch (err) {
    logger.error({ err }, '[Compliance] Error checking compliance rule DUPLICATE_IDENTIFIER');
  }

  const flags: ComplianceFlagInput[] = [];
  const pan = normalizeSpaces(payload.pan).toUpperCase();

  if (pan) {
    const panFingerprint = createHashFingerprint(pan, 'pan');
    const existing = await prisma.sellerProfile.findFirst({
      where: {
        userId: { not: payload.userId },
        OR: [{ pan }, { panFingerprint }]
      },
      select: { userId: true }
    });
    if (existing) {
      flags.push({
        userId: payload.userId,
        type: 'duplicate_pan',
        severity: 'critical',
        description: 'Seller PAN is already associated with another account',
        metadata: { panHash: hashIdentifier(pan), existingUserId: existing.userId }
      });
    }
  }

  for (const gst of payload.gstNumbers || []) {
    const normalizedGst = normalizeSpaces(gst).toUpperCase();
    if (!normalizedGst) continue;
    const gstFingerprint = createHashFingerprint(normalizedGst, 'gst');
    const existing = await prisma.sellerOffice.findFirst({
      where: {
        sellerProfile: { userId: { not: payload.userId } },
        OR: [{ gstNumber: normalizedGst }, { gstFingerprint }]
      },
      select: { sellerProfile: { select: { userId: true } } }
    });
    if (existing) {
      flags.push({
        userId: payload.userId,
        type: 'duplicate_gst',
        severity: 'high',
        description: 'Seller GSTIN is already associated with another account',
        metadata: { gstHash: hashIdentifier(normalizedGst), existingUserId: existing.sellerProfile.userId }
      });
    }
  }

  if (payload.aadhaarNumber) {
    const aadhaarHash = hashIdentifier(payload.aadhaarNumber);
    const existing = await prisma.complianceViolation.findFirst({
      where: {
        type: 'aadhaar_hash_seen',
        metadata: { path: ['aadhaarHash'], equals: aadhaarHash }
      }
    });
    if (existing && existing.userId !== payload.userId) {
      flags.push({
        userId: payload.userId,
        type: 'duplicate_aadhaar_hash',
        severity: 'critical',
        description: 'Aadhaar hash has appeared on another account',
        metadata: { aadhaarHash, existingUserId: existing.userId }
      });
    } else {
      flags.push({
        userId: payload.userId,
        type: 'aadhaar_hash_seen',
        severity: 'low',
        status: 'resolved',
        description: 'Aadhaar hash recorded for duplicate prevention',
        metadata: { aadhaarHash }
      } as ComplianceFlagInput);
    }
  }

  const created = [];
  for (const flag of flags) {
    created.push(await createComplianceFlag(flag));
  }
  return created.filter(flag => flag.severity !== 'low');
};

export const flagDuplicateBankAccount = async (payload: {
  userId: number;
  sellerProfileId: number;
  ifsc: string;
  accountNumber: string;
}) => {
  try {
    const dupRule = await prisma.complianceRule.findFirst({
      where: {
        code: { in: ['BANK_ACCOUNT_DUPLICATE', 'DUPLICATE_IDENTIFIER'] },
        isActive: true
      }
    });
    if (!dupRule) {
      logger.info('[Compliance] Skipping duplicate bank account checks because bank rules are inactive.');
      return null;
    }
  } catch (err) {
    logger.error({ err }, '[Compliance] Error checking compliance rules for bank accounts');
  }

  const accountHash = hashIdentifier(`${payload.ifsc}:${payload.accountNumber}`);
  const bankFingerprint = createHashFingerprint(`${payload.ifsc}:${payload.accountNumber}`, 'bank');
  const existing = await prisma.sellerBankAccount.findFirst({
    where: {
      sellerProfileId: { not: payload.sellerProfileId },
      OR: [
        { bankFingerprint },
        { accountNumberHash: bankFingerprint },
        { ifsc: payload.ifsc, accountNumber: payload.accountNumber }
      ]
    },
    select: { sellerProfile: { select: { userId: true } } }
  });

  if (!existing) return null;

  return createComplianceFlag({
    userId: payload.userId,
    type: 'duplicate_bank_account',
    severity: 'high',
    description: 'Bank account is already associated with another seller account',
    metadata: { accountHash, existingUserId: existing.sellerProfile.userId }
  });
};

export const markUserForManualReview = async (userId: number) =>
  prisma.user.update({
    where: { id: userId },
    data: { onboardingStatus: 'manual_review_required' as any }
  });
