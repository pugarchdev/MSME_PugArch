export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ComplianceRuleDto {
    id: number;
    code: string;
    title: string;
    description?: string | null;
    severity: Severity;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
    violations?: ComplianceViolationDto[];
}

export interface ComplianceViolationDto {
    id: number;
    userId?: number | null;
    ruleId?: number | null;
    type: string;
    severity: string;
    status: string;
    entityType?: string | null;
    entityId?: number | null;
    description: string;
    metadata?: Record<string, unknown> | null;
    resolvedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
    user?: { id: number; name?: string; email?: string; role?: string } | null;
}

export interface ComplianceRulesResponse {
    records: ComplianceRuleDto[];
    total: number;
    filters?: Record<string, unknown>;
}
