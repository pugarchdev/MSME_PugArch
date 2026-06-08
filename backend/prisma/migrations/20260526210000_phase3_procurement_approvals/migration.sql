-- Phase 3: Multi-Level Procurement Approval Workflow

DO $$ BEGIN
  CREATE TYPE "ApprovalStage" AS ENUM (
    'DEPARTMENT_HEAD',
    'FINANCE_DEPT',
    'PROCUREMENT_HEAD'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalDecision" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'SENT_FOR_CLARIFICATION'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ProcurementApproval" (
  "id"                SERIAL PRIMARY KEY,
  "entityType"        TEXT NOT NULL,
  "entityId"          INTEGER NOT NULL,
  "organizationId"    INTEGER NOT NULL,
  "stage"             "ApprovalStage" NOT NULL,
  "sequence"          INTEGER NOT NULL,
  "decision"          "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
  "approverId"        INTEGER,
  "remarks"           TEXT,
  "clarificationNote" TEXT,
  "decidedAt"         TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementApproval_entityType_entityId_stage_key" UNIQUE ("entityType", "entityId", "stage"),
  CONSTRAINT "ProcurementApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "ProcurementApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "ProcurementApproval_entityType_entityId_idx" ON "ProcurementApproval"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "ProcurementApproval_organizationId_stage_decision_idx" ON "ProcurementApproval"("organizationId", "stage", "decision");
CREATE INDEX IF NOT EXISTS "ProcurementApproval_approverId_idx" ON "ProcurementApproval"("approverId");
