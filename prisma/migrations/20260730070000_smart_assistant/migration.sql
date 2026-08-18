-- Phase 0 + 1 + 2 upgrade for an existing SQLite database.
-- Back up prisma/data.db before applying this migration.

CREATE TABLE IF NOT EXISTS "TicketCounter" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

INSERT OR IGNORE INTO "TicketCounter" ("id", "value", "updatedAt")
SELECT 'global', COALESCE(MAX("ticketNum"), 0), CURRENT_TIMESTAMP FROM "Ticket";

CREATE TABLE IF NOT EXISTS "IntentDetection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intentKey" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "optionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'detected',
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntentDetection_messageId_key" ON "IntentDetection"("messageId");
CREATE INDEX IF NOT EXISTS "IntentDetection_guildId_createdAt_idx" ON "IntentDetection"("guildId", "createdAt");
CREATE INDEX IF NOT EXISTS "IntentDetection_intentKey_createdAt_idx" ON "IntentDetection"("intentKey", "createdAt");
CREATE INDEX IF NOT EXISTS "IntentDetection_userId_createdAt_idx" ON "IntentDetection"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "SmartFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "detectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "helpful" BOOLEAN,
    "correctedIntent" TEXT,
    "note" TEXT,
    "approvedForTraining" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmartFeedback_detectionId_fkey"
      FOREIGN KEY ("detectionId") REFERENCES "IntentDetection" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmartFeedback_detectionId_key" ON "SmartFeedback"("detectionId");
CREATE INDEX IF NOT EXISTS "SmartFeedback_approvedForTraining_idx" ON "SmartFeedback"("approvedForTraining");

ALTER TABLE "GuildConfig" ADD COLUMN "smartSupportEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GuildConfig" ADD COLUMN "smartSupportChannelIds" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GuildConfig" ADD COLUMN "smartMentionOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GuildConfig" ADD COLUMN "smartCooldownSeconds" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "GuildConfig" ADD COLUMN "smartRuleThreshold" REAL NOT NULL DEFAULT 0.72;
ALTER TABLE "GuildConfig" ADD COLUMN "smartAiThreshold" REAL NOT NULL DEFAULT 0.82;
ALTER TABLE "GuildConfig" ADD COLUMN "smartAiEnabled" BOOLEAN NOT NULL DEFAULT false;
