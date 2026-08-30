ALTER TABLE "ChatLevelRewardGrant" ADD COLUMN "minecraftServiceId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "ChatLevelRewardGrant" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "ChatLevelRewardGrant" ADD COLUMN "retryBaseSeconds" INTEGER NOT NULL DEFAULT 60;

CREATE INDEX "ChatLevelRewardGrant_minecraftServiceId_status_nextAttemptAt_idx"
ON "ChatLevelRewardGrant"("minecraftServiceId", "status", "nextAttemptAt");

CREATE TABLE "MinecraftLevelServiceStatus" (
    "serverId" TEXT NOT NULL PRIMARY KEY,
    "lastSeenAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
