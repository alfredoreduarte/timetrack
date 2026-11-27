-- Share links created with an API key stop working when the key is revoked.
ALTER TABLE "share_links" ADD COLUMN "api_key_id" TEXT;
