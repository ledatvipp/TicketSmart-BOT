-- Baseline for the original core application tables.
-- This migration intentionally represents the schema before the dated Smart Assistant,
-- Knowledge, multi-cluster and SmartLearn migrations that follow it.

CREATE TABLE "Option" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "emoji" TEXT DEFAULT '🗺️',
  "description" TEXT,
  "color" TEXT DEFAULT '#5865F2',
  "discordCategoryId" TEXT,
  "welcomeMessage" TEXT,
  "autoMessages" TEXT DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "customEmbedEnabled" BOOLEAN NOT NULL DEFAULT false,
  "ticketTitle" TEXT,
  "ticketDesc" TEXT,
  "ticketGuidance" TEXT,
  "ticketFooter" TEXT,
  "ticketColor" TEXT,
  "formFields" TEXT NOT NULL DEFAULT '[]',
  "inheritFormFromId" TEXT,
  "autoCloseHours" INTEGER,
  "autoEscalateMinutes" INTEGER,
  "slaResponseMinutes" INTEGER,
  "allowedStaffRoles" TEXT NOT NULL DEFAULT '',
  "pingStaff" TEXT NOT NULL DEFAULT '',
  "maxOpenPerUser" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Option_isActive_idx" ON "Option"("isActive");
CREATE INDEX "Option_sortOrder_idx" ON "Option"("sortOrder");

CREATE TABLE "Ticket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketNum" INTEGER NOT NULL,
  "optionId" TEXT,
  "type" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "creatorName" TEXT NOT NULL,
  "creatorAvatar" TEXT,
  "claimerId" TEXT,
  "claimerName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'creating',
  "channelId" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "note" TEXT,
  "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" DATETIME,
  "closedAt" DATETIME,
  "firstResponseAt" DATETIME,
  "lastMessageAt" DATETIME,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "slaBreachedAt" DATETIME,
  "closedBy" TEXT,
  "closeReason" TEXT,
  "tags" TEXT NOT NULL DEFAULT '',
  "watchers" TEXT NOT NULL DEFAULT '',
  "formData" TEXT NOT NULL DEFAULT '{}',
  CONSTRAINT "Ticket_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Ticket_ticketNum_key" ON "Ticket"("ticketNum");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_type_idx" ON "Ticket"("type");
CREATE INDEX "Ticket_priority_idx" ON "Ticket"("priority");
CREATE INDEX "Ticket_openedAt_idx" ON "Ticket"("openedAt");
CREATE INDEX "Ticket_channelId_idx" ON "Ticket"("channelId");
CREATE INDEX "Ticket_creatorId_idx" ON "Ticket"("creatorId");
CREATE INDEX "Ticket_claimerId_idx" ON "Ticket"("claimerId");
CREATE INDEX "Ticket_slaBreachedAt_idx" ON "Ticket"("slaBreachedAt");

CREATE TABLE "Message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT NOT NULL,
  "discordMessageId" TEXT,
  "authorId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "authorAvatar" TEXT,
  "isBot" BOOLEAN NOT NULL DEFAULT false,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "content" TEXT NOT NULL,
  "attachments" TEXT NOT NULL DEFAULT '[]',
  "timestamp" DATETIME NOT NULL,
  CONSTRAINT "Message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Message_discordMessageId_key" ON "Message"("discordMessageId");
CREATE INDEX "Message_ticketId_timestamp_idx" ON "Message"("ticketId", "timestamp");
CREATE INDEX "Message_authorId_idx" ON "Message"("authorId");
CREATE INDEX "Message_isInternal_idx" ON "Message"("isInternal");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "actorKind" TEXT NOT NULL DEFAULT 'user',
  "action" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_ticketId_idx" ON "AuditLog"("ticketId");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE TABLE "Staff" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "discordId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "avatar" TEXT,
  "role" TEXT NOT NULL DEFAULT 'MOD',
  "permissions" TEXT NOT NULL DEFAULT '{}',
  "allowedOptions" TEXT NOT NULL DEFAULT '',
  "totpSecret" TEXT,
  "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Staff_discordId_key" ON "Staff"("discordId");

CREATE TABLE "CannedResponse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shortcut" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "CannedResponse_shortcut_key" ON "CannedResponse"("shortcut");

CREATE TABLE "RefreshToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "discordId" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" DATETIME
);
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");
CREATE INDEX "RefreshToken_discordId_idx" ON "RefreshToken"("discordId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

CREATE TABLE "Rating" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT NOT NULL,
  "raterId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "staffId" TEXT,
  "staffName" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Rating_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Rating_ticketId_key" ON "Rating"("ticketId");
CREATE INDEX "Rating_staffId_idx" ON "Rating"("staffId");
CREATE INDEX "Rating_score_idx" ON "Rating"("score");
CREATE INDEX "Rating_createdAt_idx" ON "Rating"("createdAt");

CREATE TABLE "AutoTagRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "keywords" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "matchAll" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Faq" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "keywords" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT '',
  "views" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Faq_enabled_idx" ON "Faq"("enabled");

CREATE TABLE "Webhook" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "secret" TEXT,
  "events" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "discordId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "keys" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_discordId_idx" ON "PushSubscription"("discordId");

CREATE TABLE "TicketCreateLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "creatorId" TEXT NOT NULL,
  "optionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TicketCreateLog_creatorId_createdAt_idx" ON "TicketCreateLog"("creatorId", "createdAt");

CREATE TABLE "GuildConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "embedChannelId" TEXT,
  "logChannelId" TEXT,
  "staffRoleId" TEXT,
  "embedTitle" TEXT NOT NULL DEFAULT '🎮 Hệ Thống Hỗ Trợ Ticket',
  "embedDesc" TEXT NOT NULL DEFAULT 'Chọn loại hỗ trợ bên dưới để tạo ticket.',
  "embedColor" TEXT NOT NULL DEFAULT '#5865F2',
  "embedThumbnail" TEXT,
  "embedImage" TEXT,
  "embedFooter" TEXT NOT NULL DEFAULT '🎮 Game Server Support System',
  "embedAuthorIcon" TEXT,
  "embedFooterIcon" TEXT,
  "selectPlaceholder" TEXT NOT NULL DEFAULT '📋 Chọn loại hỗ trợ...',
  "ticketTitle" TEXT NOT NULL DEFAULT '🎫 Ticket #{ticketNum}',
  "ticketDesc" TEXT NOT NULL DEFAULT 'Xin chào {user}! Ticket của bạn đã được tạo thành công.',
  "ticketGuidance" TEXT NOT NULL DEFAULT '• Mô tả vấn đề chi tiết\n• Kèm ảnh/video nếu có',
  "ticketFooter" TEXT NOT NULL DEFAULT 'ID: {ticketNum} • Hệ thống Ticket',
  "ticketColor" TEXT NOT NULL DEFAULT '#5865F2',
  "ticketShowType" BOOLEAN NOT NULL DEFAULT true,
  "ticketShowCreator" BOOLEAN NOT NULL DEFAULT true,
  "ticketShowTime" BOOLEAN NOT NULL DEFAULT true,
  "ticketShowGuide" BOOLEAN NOT NULL DEFAULT true,
  "deleteSetupMessages" BOOLEAN NOT NULL DEFAULT true,
  "dmOnTicketCreate" BOOLEAN NOT NULL DEFAULT true,
  "dmMessage" TEXT NOT NULL DEFAULT '✅ Ticket **#{ticketNum}** của bạn đã được tạo!\nVào {channel} để xem.',
  "dmOnTicketClose" BOOLEAN NOT NULL DEFAULT true,
  "ratingDmEnabled" BOOLEAN NOT NULL DEFAULT true,
  "slaUrgentMinutes" INTEGER NOT NULL DEFAULT 15,
  "slaHighMinutes" INTEGER NOT NULL DEFAULT 60,
  "slaNormalMinutes" INTEGER NOT NULL DEFAULT 240,
  "defaultAutoCloseHours" INTEGER NOT NULL DEFAULT 0,
  "defaultAutoEscalateMinutes" INTEGER NOT NULL DEFAULT 0,
  "globalMaxOpenPerUser" INTEGER NOT NULL DEFAULT 3,
  "ticketCooldownSeconds" INTEGER NOT NULL DEFAULT 60
);
CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "GuildConfig"("guildId");

CREATE TABLE "GeneratedBanner" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "config" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
