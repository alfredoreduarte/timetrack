-- The AI multiplier is retired: AI time bills at the entry's rate or the
-- project's flat agent rate. This column was added by this release and was
-- never in production. (users.ai_multiplier stays, unused, so the previous
-- release can still run against this database.)
ALTER TABLE "projects" DROP COLUMN "ai_multiplier";
