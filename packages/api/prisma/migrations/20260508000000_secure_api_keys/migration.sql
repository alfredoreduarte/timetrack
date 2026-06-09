-- Safety guard: this migration is only safe if api_keys is empty. Prior to
-- this PR no code ever inserted rows, but if any environment somehow has
-- data, fail loudly rather than producing a confusing mid-ALTER null violation.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM api_keys) > 0 THEN
    RAISE EXCEPTION 'api_keys is non-empty; manual reconciliation required before this migration can run';
  END IF;
END $$;

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
