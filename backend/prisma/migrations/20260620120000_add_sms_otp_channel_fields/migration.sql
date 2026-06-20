ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredOtpChannel" TEXT NOT NULL DEFAULT 'email';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorChannel" TEXT NOT NULL DEFAULT 'email';

ALTER TABLE "OtpVerification" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'email';

CREATE INDEX IF NOT EXISTS "OtpVerification_identifierHash_purpose_channel_idx"
ON "OtpVerification"("identifierHash", "purpose", "channel");
