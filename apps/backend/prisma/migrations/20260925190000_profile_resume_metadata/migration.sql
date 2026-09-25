-- Additive, nullable columns for persistent resume metadata on UserProfile.
-- Only parsed structured metadata (JSON) and the display file name are stored;
-- the raw PDF is never persisted.
ALTER TABLE "UserProfile" ADD COLUMN "resumeContext" JSONB;
ALTER TABLE "UserProfile" ADD COLUMN "resumeFileName" TEXT;
