-- Phase 3 + 4: Knowledge Base, grounded answer and audited Action Engine
CREATE TABLE "KnowledgeArticle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT '',
  "keywords" TEXT NOT NULL DEFAULT '',
  "actions" TEXT NOT NULL DEFAULT '[]',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "sourceLabel" TEXT NOT NULL DEFAULT 'IS7MC Knowledge Base',
  "sourceUrl" TEXT,
  "embedding" TEXT,
  "embeddingModel" TEXT,
  "embeddingHash" TEXT,
  "embeddingUpdatedAt" DATETIME,
  "views" INTEGER NOT NULL DEFAULT 0,
  "helpfulCount" INTEGER NOT NULL DEFAULT 0,
  "unhelpfulCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "KnowledgeArticle_slug_key" ON "KnowledgeArticle"("slug");
CREATE INDEX "KnowledgeArticle_enabled_category_idx" ON "KnowledgeArticle"("enabled", "category");
CREATE INDEX "KnowledgeArticle_updatedAt_idx" ON "KnowledgeArticle"("updatedAt");

CREATE TABLE "KnowledgeRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "articleId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" TEXT NOT NULL,
  "actorId" TEXT,
  "actorName" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeRevision_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "KnowledgeRevision_articleId_version_idx" ON "KnowledgeRevision"("articleId", "version");

CREATE TABLE "ActionExecution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "detectionId" TEXT,
  "actionName" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "guildId" TEXT,
  "channelId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'started',
  "input" TEXT NOT NULL DEFAULT '{}',
  "result" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ActionExecution_createdAt_idx" ON "ActionExecution"("createdAt");
CREATE INDEX "ActionExecution_actionName_status_idx" ON "ActionExecution"("actionName", "status");
CREATE INDEX "ActionExecution_detectionId_idx" ON "ActionExecution"("detectionId");
CREATE INDEX "ActionExecution_userId_idx" ON "ActionExecution"("userId");

ALTER TABLE "GuildConfig" ADD COLUMN "smartKnowledgeEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "smartKnowledgeAiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GuildConfig" ADD COLUMN "smartKnowledgeThreshold" REAL NOT NULL DEFAULT 0.3;
ALTER TABLE "GuildConfig" ADD COLUMN "smartKnowledgeMaxResults" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "GuildConfig" ADD COLUMN "smartAnswerMaxChars" INTEGER NOT NULL DEFAULT 1800;
ALTER TABLE "GuildConfig" ADD COLUMN "smartEscalationRoleId" TEXT;
ALTER TABLE "GuildConfig" ADD COLUMN "smartEscalationChannelId" TEXT;
