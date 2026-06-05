-- Dashboard/API list-performance indexes for common filters and sorts.
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

CREATE INDEX IF NOT EXISTS "Organization_organizationType_idx" ON "Organization"("organizationType");
CREATE INDEX IF NOT EXISTS "Organization_createdAt_idx" ON "Organization"("createdAt");
CREATE INDEX IF NOT EXISTS "Organization_updatedAt_idx" ON "Organization"("updatedAt");

CREATE INDEX IF NOT EXISTS "Company_createdAt_idx" ON "Company"("createdAt");
CREATE INDEX IF NOT EXISTS "Company_updatedAt_idx" ON "Company"("updatedAt");

CREATE INDEX IF NOT EXISTS "BuyerRequirement_createdAt_idx" ON "BuyerRequirement"("createdAt");
CREATE INDEX IF NOT EXISTS "RequirementResponse_createdAt_idx" ON "RequirementResponse"("createdAt");

CREATE INDEX IF NOT EXISTS "PaymentTransaction_status_idx" ON "PaymentTransaction"("status");

CREATE INDEX IF NOT EXISTS "EscrowAccount_status_idx" ON "EscrowAccount"("status");
CREATE INDEX IF NOT EXISTS "EscrowAccount_createdAt_idx" ON "EscrowAccount"("createdAt");

CREATE INDEX IF NOT EXISTS "ProcurementBidParticipation_submissionStatus_idx" ON "ProcurementBidParticipation"("submissionStatus");
CREATE INDEX IF NOT EXISTS "ProcurementBidParticipation_submittedAt_idx" ON "ProcurementBidParticipation"("submittedAt");
