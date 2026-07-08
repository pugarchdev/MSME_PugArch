CREATE TABLE IF NOT EXISTS "PasswordHistory" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PasswordHistory_userId_createdAt_idx" ON "PasswordHistory"("userId", "createdAt");
