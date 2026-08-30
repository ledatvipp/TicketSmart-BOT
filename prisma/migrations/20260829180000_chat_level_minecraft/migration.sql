ALTER TABLE "GuildConfig" ADD COLUMN "chatLevelConfig" TEXT NOT NULL DEFAULT '{"version":1,"enabled":false,"requiredVerifiedRoleIds":["1543196526946291783"],"allowedChannelIds":[],"xpPerMessage":20,"minContentLength":10,"cooldownSeconds":60,"similarityWindow":10,"similarityThreshold":0.9,"levelRoles":[],"rewardSpins":1,"rewardMilestones":[],"announcementEnabled":true,"announcementChannelId":null,"adminRoleIds":[]}';

CREATE TABLE "ChatLevelProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "totalExperience" INTEGER NOT NULL DEFAULT 0,
    "lastAwardedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ChatLevelMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "normalizedContent" TEXT NOT NULL,
    "awardedExperience" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ChatLevelRewardGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "spins" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "leaseToken" TEXT,
    "leaseExpiresAt" DATETIME,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryReference" TEXT,
    "lastError" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ChatLevelProfile_guildId_userId_key" ON "ChatLevelProfile"("guildId", "userId");
CREATE INDEX "ChatLevelProfile_guildId_level_totalExperience_idx" ON "ChatLevelProfile"("guildId", "level", "totalExperience");
CREATE UNIQUE INDEX "ChatLevelMessage_guildId_messageId_key" ON "ChatLevelMessage"("guildId", "messageId");
CREATE INDEX "ChatLevelMessage_guildId_userId_createdAt_idx" ON "ChatLevelMessage"("guildId", "userId", "createdAt");
CREATE UNIQUE INDEX "ChatLevelRewardGrant_guildId_userId_level_key" ON "ChatLevelRewardGrant"("guildId", "userId", "level");
CREATE INDEX "ChatLevelRewardGrant_status_nextAttemptAt_idx" ON "ChatLevelRewardGrant"("status", "nextAttemptAt");
CREATE INDEX "ChatLevelRewardGrant_guildId_userId_createdAt_idx" ON "ChatLevelRewardGrant"("guildId", "userId", "createdAt");
