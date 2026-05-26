export type FraudAlertStatus = 'OPEN' | 'UNDER_REVIEW' | 'CONFIRMED' | 'DISMISSED' | 'RESOLVED';
export type FraudAlertType =
    | 'DUPLICATE_PAN'
    | 'DUPLICATE_GST'
    | 'DUPLICATE_BANK'
    | 'DUPLICATE_AADHAAR_HASH'
    | 'SAME_IP_MULTIPLE_ACCOUNTS'
    | 'SUSPICIOUS_BID_PATTERN'
    | 'PAYMENT_ANOMALY'
    | 'DOCUMENT_MISMATCH'
    | 'MANUAL_FLAG';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FraudAlertDto {
    id: number;
    alertType: FraudAlertType;
    severity: Severity;
    status: FraudAlertStatus;
    userId?: number | null;
    organizationId?: number | null;
    entityType?: string | null;
    entityId?: number | null;
    details: Record<string, unknown>;
    reviewedById?: number | null;
    reviewedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
    user?: { id: number; name?: string; email?: string; role?: string } | null;
    organization?: { id: number; organizationName?: string } | null;
    reviewedBy?: { id: number; name?: string; email?: string } | null;
}

export interface FraudAlertsResponse {
    records: FraudAlertDto[];
    total: number;
    openComplianceFlags?: number;
    failedLogins?: number;
    filters?: Record<string, unknown>;
}
