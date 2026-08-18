-- SmartLearn v2: lifecycle, quality, suggested article matching and dashboard knowledge manager
ALTER TABLE "KnowledgeArticle" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "KnowledgeArticle" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "KnowledgeArticle" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KnowledgeArticle" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "KnowledgeArticle" ADD COLUMN "reviewDueAt" DATETIME;
ALTER TABLE "KnowledgeArticle" ADD COLUMN "lastReviewedAt" DATETIME;
ALTER TABLE "KnowledgeArticle" ADD COLUMN "lastReviewedBy" TEXT;
ALTER TABLE "KnowledgeArticle" ADD COLUMN "qualityScore" REAL NOT NULL DEFAULT 1.0;
ALTER TABLE "KnowledgeArticle" ADD COLUMN "confidenceFloor" REAL NOT NULL DEFAULT 0.3;
CREATE INDEX "KnowledgeArticle_status_enabled_idx" ON "KnowledgeArticle"("status", "enabled");
CREATE INDEX "KnowledgeArticle_expiresAt_idx" ON "KnowledgeArticle"("expiresAt");
CREATE INDEX "KnowledgeArticle_reviewDueAt_idx" ON "KnowledgeArticle"("reviewDueAt");
CREATE INDEX "KnowledgeArticle_pinned_updatedAt_idx" ON "KnowledgeArticle"("pinned", "updatedAt");

ALTER TABLE "KnowledgeCandidate" ADD COLUMN "candidateType" TEXT NOT NULL DEFAULT 'NEW_ARTICLE';
ALTER TABLE "KnowledgeCandidate" ADD COLUMN "targetArticleId" TEXT REFERENCES "KnowledgeArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeCandidate" ADD COLUMN "matchScore" REAL NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeCandidate" ADD COLUMN "priorityScore" REAL NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeCandidate" ADD COLUMN "resolutionNote" TEXT;
CREATE INDEX "KnowledgeCandidate_targetArticleId_status_idx" ON "KnowledgeCandidate"("targetArticleId", "status");
CREATE INDEX "KnowledgeCandidate_priorityScore_updatedAt_idx" ON "KnowledgeCandidate"("priorityScore", "updatedAt");
