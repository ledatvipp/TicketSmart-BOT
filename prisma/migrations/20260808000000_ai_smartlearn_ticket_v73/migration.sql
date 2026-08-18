-- v7.3: evidence-aware AI, structured ticket triage, SmartLearn quality signals.

ALTER TABLE "Ticket" ADD COLUMN "aiTriage" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Ticket" ADD COLUMN "aiTriageConfidence" REAL;
ALTER TABLE "Ticket" ADD COLUMN "aiEvidenceScore" REAL;
ALTER TABLE "Ticket" ADD COLUMN "aiNeedsHuman" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN "aiMissingInfo" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Ticket" ADD COLUMN "aiLastTriageAt" DATETIME;
CREATE INDEX "Ticket_aiNeedsHuman_idx" ON "Ticket"("aiNeedsHuman");
CREATE INDEX "Ticket_aiLastTriageAt_idx" ON "Ticket"("aiLastTriageAt");

ALTER TABLE "KnowledgeCandidate" ADD COLUMN "learningScore" REAL NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeCandidate" ADD COLUMN "evidenceScore" REAL NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeCandidate" ADD COLUMN "sourceDiversity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "KnowledgeCandidate" ADD COLUMN "conflictScore" REAL NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeCandidate" ADD COLUMN "negativeSignalCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeCandidate" ADD COLUMN "lastSeenAt" DATETIME;
UPDATE "KnowledgeCandidate" SET "lastSeenAt" = COALESCE("updatedAt", "createdAt") WHERE "lastSeenAt" IS NULL;
CREATE INDEX "KnowledgeCandidate_learningScore_updatedAt_idx" ON "KnowledgeCandidate"("learningScore", "updatedAt");
CREATE INDEX "KnowledgeCandidate_lastSeenAt_idx" ON "KnowledgeCandidate"("lastSeenAt");

ALTER TABLE "GuildConfig" ADD COLUMN "smartEvidenceMinScore" REAL NOT NULL DEFAULT 0.50;
ALTER TABLE "GuildConfig" ADD COLUMN "smartEvidenceMinTopGap" REAL NOT NULL DEFAULT 0.04;
ALTER TABLE "GuildConfig" ADD COLUMN "smartKnowledgeFreshnessDays" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiContextMessages" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiTriageEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiTriageMinConfidence" REAL NOT NULL DEFAULT 0.75;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiAutoPriority" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiAutoTags" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketAiAutoEscalateSensitive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnFromResolvedTickets" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnMinLearningScore" REAL NOT NULL DEFAULT 0.45;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnMinSourceDiversity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnConflictThreshold" REAL NOT NULL DEFAULT 0.70;
ALTER TABLE "GuildConfig" ADD COLUMN "smartLearnReviewIntervalDays" INTEGER NOT NULL DEFAULT 90;
