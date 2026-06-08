-- Phase 1: Intra-Organisation Roles (OrgMembership + OrgInvitation)
-- Idempotent migration with IF NOT EXISTS guards

-- Create OrgRole enum
DO $$ BEGIN
  CREATE TYPE "OrgRole" AS ENUM (
    'ORG_ADMIN',
    'PROCUREMENT_OFFICER',
    'FINANCE_OFFICER',
    'TECHNICAL_OFFICER',
    'LOGISTICS_OFFICER',
    'VIEWER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create OrgMembership table
CREATE TABLE IF NOT EXISTS "OrgMembership" (
  "id"             SERIAL PRIMARY KEY,
  "userId"         INTEGER NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "orgRole"        "OrgRole" NOT NULL DEFAULT 'VIEWER',
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "invitedById"    INTEGER,
  "invitedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgMembership_userId_organizationId_key" UNIQUE ("userId", "organizationId"),
  CONSTRAINT "OrgMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "OrgMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "OrgMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "OrgMembership_organizationId_orgRole_idx" ON "OrgMembership"("organizationId", "orgRole");
CREATE INDEX IF NOT EXISTS "OrgMembership_userId_idx" ON "OrgMembership"("userId");
CREATE INDEX IF NOT EXISTS "OrgMembership_invitedById_idx" ON "OrgMembership"("invitedById");

-- Create OrgInvitation table
CREATE TABLE IF NOT EXISTS "OrgInvitation" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "email"          TEXT NOT NULL,
  "orgRole"        "OrgRole" NOT NULL,
  "token"          TEXT NOT NULL,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "acceptedAt"     TIMESTAMP(3),
  "invitedById"    INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgInvitation_token_key" UNIQUE ("token"),
  CONSTRAINT "OrgInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "OrgInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "OrgInvitation_organizationId_idx" ON "OrgInvitation"("organizationId");
CREATE INDEX IF NOT EXISTS "OrgInvitation_token_idx" ON "OrgInvitation"("token");
CREATE INDEX IF NOT EXISTS "OrgInvitation_email_idx" ON "OrgInvitation"("email");
