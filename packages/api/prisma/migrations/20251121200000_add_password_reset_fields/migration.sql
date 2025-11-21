-- Add password reset fields to users table
ALTER TABLE "users"
ADD COLUMN "passwordResetToken" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

-- Create index on passwordResetToken for faster lookups
CREATE INDEX "users_passwordResetToken_idx" ON "users"("passwordResetToken");
