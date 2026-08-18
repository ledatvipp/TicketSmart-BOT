-- v6: professional compact ticket workflow + safe in-ticket AI assistant
ALTER TABLE "Ticket" ADD COLUMN "workflowStatus" TEXT NOT NULL DEFAULT 'waiting_staff';
ALTER TABLE "Ticket" ADD COLUMN "panelMessageId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "aiPanelMessageId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "aiPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN "aiReplyCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ticket" ADD COLUMN "aiLastIntent" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "aiLastReplyAt" DATETIME;
ALTER TABLE "Ticket" ADD COLUMN "aiSummary" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "lastUserMessageAt" DATETIME;
ALTER TABLE "Ticket" ADD COLUMN "lastStaffMessageAt" DATETIME;
ALTER TABLE "Ticket" ADD COLUMN "lastEscalatedAt" DATETIME;
CREATE INDEX "Ticket_workflowStatus_idx" ON "Ticket"("workflowStatus");
CREATE INDEX "Ticket_lastUserMessageAt_idx" ON "Ticket"("lastUserMessageAt");

ALTER TABLE "GuildConfig" ADD COLUMN "ticketCompactMode" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiMode" TEXT NOT NULL DEFAULT 'balanced';
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiOnlyCreator" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiRequireQuestion" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiPauseWhenClaimed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiSensitiveEscalation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiPanelMode" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiAutoSummary" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiReplyCooldownSeconds" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiMaxReplies" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiMinConfidence" REAL NOT NULL DEFAULT 0.78;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiMaxAnswerChars" INTEGER NOT NULL DEFAULT 650;
