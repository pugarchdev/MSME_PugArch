-- Aadhaar KYC via MeriPehchaan/API Setu Auth Partner.
-- Stores only verification/session metadata. Aadhaar numbers, OTPs, tokens,
-- client secrets, and raw provider responses are intentionally not stored.

CREATE TYPE "KycProvider" AS ENUM ('MERIPEHCHAAN');
CREATE TYPE "KycVerificationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED', 'EXPIRED');
CREATE TYPE "KycAuditStatus" AS ENUM ('STARTED', 'PENDING', 'VERIFIED', 'FAILED', 'EXPIRED', 'RESET');

CREATE TABLE "KycAuthSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "organizationId" INTEGER,
    "provider" "KycProvider" NOT NULL DEFAULT 'MERIPEHCHAAN',
    "verificationType" "VerificationType" NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "acr" TEXT,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KycAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserKycVerification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "organizationId" INTEGER,
    "provider" "KycProvider" NOT NULL DEFAULT 'MERIPEHCHAAN',
    "verificationType" "VerificationType" NOT NULL,
    "status" "KycVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedName" TEXT,
    "verifiedDob" TIMESTAMP(3),
    "verifiedGender" TEXT,
    "verifiedEmail" TEXT,
    "verifiedAddress" JSONB,
    "ageVerified" BOOLEAN,
    "digilockerId" TEXT,
    "referenceKey" TEXT,
    "idTokenSubject" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserKycVerification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KycAuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "organizationId" INTEGER,
    "provider" "KycProvider" NOT NULL,
    "verificationType" "VerificationType" NOT NULL,
    "action" TEXT NOT NULL,
    "status" "KycAuditStatus" NOT NULL,
    "message" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KycAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KycAuthSession_state_key" ON "KycAuthSession"("state");
CREATE INDEX "KycAuthSession_userId_idx" ON "KycAuthSession"("userId");
CREATE INDEX "KycAuthSession_expiresAt_idx" ON "KycAuthSession"("expiresAt");
CREATE INDEX "KycAuthSession_provider_verificationType_idx" ON "KycAuthSession"("provider", "verificationType");
CREATE INDEX "KycAuthSession_organizationId_idx" ON "KycAuthSession"("organizationId");

CREATE UNIQUE INDEX "UserKycVerification_userId_provider_verificationType_key" ON "UserKycVerification"("userId", "provider", "verificationType");
CREATE INDEX "UserKycVerification_organizationId_idx" ON "UserKycVerification"("organizationId");
CREATE INDEX "UserKycVerification_status_idx" ON "UserKycVerification"("status");

CREATE INDEX "KycAuditLog_userId_idx" ON "KycAuditLog"("userId");
CREATE INDEX "KycAuditLog_organizationId_idx" ON "KycAuditLog"("organizationId");
CREATE INDEX "KycAuditLog_provider_verificationType_idx" ON "KycAuditLog"("provider", "verificationType");
CREATE INDEX "KycAuditLog_createdAt_idx" ON "KycAuditLog"("createdAt");

ALTER TABLE "KycAuthSession" ADD CONSTRAINT "KycAuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KycAuthSession" ADD CONSTRAINT "KycAuthSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserKycVerification" ADD CONSTRAINT "UserKycVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserKycVerification" ADD CONSTRAINT "UserKycVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KycAuditLog" ADD CONSTRAINT "KycAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KycAuditLog" ADD CONSTRAINT "KycAuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
