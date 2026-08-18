-- SmartLearn v1: human-reviewed knowledge loop
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnReviewChannelId" TEXT;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnReviewerRoleIds" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnAdminRoleIds" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnDeliveryMode" TEXT NOT NULL DEFAULT 'channel';
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnMaxDmReviewers" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnCandidateConfidence" REAL NOT NULL DEFAULT 0.70;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnDuplicateThreshold" REAL NOT NULL DEFAULT 0.82;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnStaffVotesRequired" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnAdminVotesRequired" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnMaxCandidatesPerHour" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnNotifyUser" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnCreateFromNegativeVote" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "KnowledgeAlias" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "articleId" TEXT NOT NULL,
  "phrase" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "weight" REAL NOT NULL DEFAULT 1.0,
  "sourceCandidateId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeAlias_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KnowledgeAlias_articleId_normalized_key" ON "KnowledgeAlias"("articleId", "normalized");
CREATE INDEX "KnowledgeAlias_normalized_idx" ON "KnowledgeAlias"("normalized");
CREATE INDEX "KnowledgeAlias_sourceCandidateId_idx" ON "KnowledgeAlias"("sourceCandidateId");

CREATE TABLE "KnowledgeCandidate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dedupeKey" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "clusterKey" TEXT,
  "intentKey" TEXT,
  "question" TEXT NOT NULL,
  "normalizedQuestion" TEXT NOT NULL,
  "questionHash" TEXT NOT NULL,
  "proposedTitle" TEXT,
  "proposedAnswer" TEXT,
  "proposedKeywords" TEXT NOT NULL DEFAULT '',
  "sourceType" TEXT NOT NULL DEFAULT 'SMART_MESSAGE',
  "sourceTicketId" TEXT,
  "sourceChannelId" TEXT,
  "sourceMessageId" TEXT,
  "sourceUserId" TEXT,
  "sourceUserName" TEXT,
  "sourceExamples" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "riskLevel" TEXT NOT NULL DEFAULT 'NORMAL',
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "approvalCount" INTEGER NOT NULL DEFAULT 0,
  "rejectionCount" INTEGER NOT NULL DEFAULT 0,
  "deliveryRefs" TEXT NOT NULL DEFAULT '[]',
  "approvedArticleId" TEXT,
  "reviewedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "KnowledgeCandidate_approvedArticleId_fkey" FOREIGN KEY ("approvedArticleId") REFERENCES "KnowledgeArticle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KnowledgeCandidate_dedupeKey_key" ON "KnowledgeCandidate"("dedupeKey");
CREATE INDEX "KnowledgeCandidate_guildId_status_createdAt_idx" ON "KnowledgeCandidate"("guildId", "status", "createdAt");
CREATE INDEX "KnowledgeCandidate_clusterKey_status_idx" ON "KnowledgeCandidate"("clusterKey", "status");
CREATE INDEX "KnowledgeCandidate_intentKey_status_idx" ON "KnowledgeCandidate"("intentKey", "status");
CREATE INDEX "KnowledgeCandidate_questionHash_idx" ON "KnowledgeCandidate"("questionHash");
CREATE INDEX "KnowledgeCandidate_sourceTicketId_idx" ON "KnowledgeCandidate"("sourceTicketId");

CREATE TABLE "KnowledgeReview" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "candidateId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "reviewerName" TEXT NOT NULL,
  "reviewerKind" TEXT NOT NULL DEFAULT 'STAFF',
  "action" TEXT NOT NULL,
  "answer" TEXT,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "KnowledgeReview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "KnowledgeCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KnowledgeReview_candidateId_reviewerId_key" ON "KnowledgeReview"("candidateId", "reviewerId");
CREATE INDEX "KnowledgeReview_candidateId_action_idx" ON "KnowledgeReview"("candidateId", "action");
CREATE INDEX "KnowledgeReview_reviewerId_createdAt_idx" ON "KnowledgeReview"("reviewerId", "createdAt");
