-- AlterTable
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" TEXT,
ADD COLUMN "stripe_subscription_id" TEXT,
ADD COLUMN "subscription_status" TEXT,
ADD COLUMN "subscription_current_period_end" TIMESTAMP(3),
ADD COLUMN "subscription_cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "is_subscription_exempt" BOOLEAN NOT NULL DEFAULT false;

-- Grandfather existing users: exempt them from subscription requirement
UPDATE "users" SET "is_subscription_exempt" = true;

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_subscription_id_key" ON "users"("stripe_subscription_id");
