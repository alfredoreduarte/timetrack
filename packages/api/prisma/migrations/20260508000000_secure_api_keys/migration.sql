-- DropIndex
DROP INDEX "api_keys_key_idx";

-- DropIndex
DROP INDEX "api_keys_key_key";

-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "key",
DROP COLUMN "lastUsed",
ADD COLUMN     "key_hash" TEXT NOT NULL,
ADD COLUMN     "key_prefix" TEXT NOT NULL,
ADD COLUMN     "last_used_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");
