-- Add persistent user profile fields for first-time setup
ALTER TABLE "UserProfile" ADD COLUMN "education" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "githubUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "profileComplete" BOOLEAN NOT NULL DEFAULT false;

-- Index for user results-history listing (scoped by user, newest first)
CREATE INDEX "Interview_userId_createdAt_idx" ON "Interview"("userId", "createdAt" DESC);

-- Drop the unused per-question metrics table (never written or read by the app)
DROP TABLE "QuestionResponse";
