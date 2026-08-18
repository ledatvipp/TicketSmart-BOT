-- Smart Assistant v5: conversation memory, clarification and reliability config
CREATE TABLE "SmartConversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "context" TEXT NOT NULL DEFAULT '{}',
  "pendingIntents" TEXT NOT NULL DEFAULT '[]',
  "lastIntentKey" TEXT,
  "lastDetectionId" TEXT,
  "turnCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "SmartConversation_guildId_channelId_userId_key" ON "SmartConversation"("guildId", "channelId", "userId");
CREATE INDEX "SmartConversation_expiresAt_idx" ON "SmartConversation"("expiresAt");
CREATE INDEX "SmartConversation_userId_updatedAt_idx" ON "SmartConversation"("userId", "updatedAt");

CREATE TABLE "SmartConversationMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "intentKey" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmartConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SmartConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SmartConversationMessage_conversationId_createdAt_idx" ON "SmartConversationMessage"("conversationId", "createdAt");

ALTER TABLE "GuildConfig" ADD COLUMN "smartConversationEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "smartConversationTtlMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "GuildConfig" ADD COLUMN "smartMaxContextMessages" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "GuildConfig" ADD COLUMN "smartClarificationEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "smartClarificationThreshold" REAL NOT NULL DEFAULT 0.62;
ALTER TABLE "GuildConfig" ADD COLUMN "smartMultiIntentEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "smartMaxIntents" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "GuildConfig" ADD COLUMN "smartFuzzyMatchingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "smartResponseCacheSeconds" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "GuildConfig" ADD COLUMN "smartAiRetryCount" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "GuildConfig" ADD COLUMN "smartBurstLimitPerMinute" INTEGER NOT NULL DEFAULT 8;
