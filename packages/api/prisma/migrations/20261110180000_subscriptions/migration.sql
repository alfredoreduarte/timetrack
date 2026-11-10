-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_subscription_exempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripe_customer_id" TEXT,
ADD COLUMN     "stripe_subscription_id" TEXT,
ADD COLUMN     "subscription_cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subscription_current_period_end" TIMESTAMP(3),
ADD COLUMN     "subscription_interval" TEXT,
ADD COLUMN     "subscription_price_id" TEXT,
ADD COLUMN     "subscription_status" TEXT,
ADD COLUMN     "trial_ends_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_subscription_id_key" ON "users"("stripe_subscription_id");


-- Grandfather every user who signed up before paid plans: Pro, free.
UPDATE "users" SET "is_subscription_exempt" = true;
