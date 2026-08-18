CREATE TABLE "Cluster" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "emoji" TEXT NOT NULL DEFAULT '🗺️',
  "color" TEXT NOT NULL DEFAULT '#5865F2',
  "aliases" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "discordCategoryId" TEXT,
  "supportChannelIds" TEXT NOT NULL DEFAULT '',
  "staffRoleIds" TEXT NOT NULL DEFAULT '',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Cluster_key_key" ON "Cluster"("key");
CREATE INDEX "Cluster_isActive_sortOrder_idx" ON "Cluster"("isActive", "sortOrder");

ALTER TABLE "Option" ADD COLUMN "clusterKeys" TEXT NOT NULL DEFAULT '*';
ALTER TABLE "Ticket" ADD COLUMN "clusterKey" TEXT;
ALTER TABLE "TicketCreateLog" ADD COLUMN "clusterKey" TEXT;
ALTER TABLE "SmartConversation" ADD COLUMN "clusterKey" TEXT;
ALTER TABLE "IntentDetection" ADD COLUMN "clusterKey" TEXT;
ALTER TABLE "KnowledgeArticle" ADD COLUMN "clusterKeys" TEXT NOT NULL DEFAULT '*';
ALTER TABLE "ActionExecution" ADD COLUMN "clusterKey" TEXT;
ALTER TABLE "GuildConfig" ADD COLUMN "smartRequireCluster" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "smartDefaultClusterKey" TEXT;
ALTER TABLE "GuildConfig" ADD COLUMN "smartClusterChannelMap" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "GuildConfig" ADD COLUMN "ticketRequireCluster" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "ticketClusterSelectEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Ticket_clusterKey_idx" ON "Ticket"("clusterKey");
CREATE INDEX "IntentDetection_clusterKey_createdAt_idx" ON "IntentDetection"("clusterKey", "createdAt");
CREATE INDEX "KnowledgeArticle_clusterKeys_idx" ON "KnowledgeArticle"("clusterKeys");
CREATE INDEX "ActionExecution_clusterKey_createdAt_idx" ON "ActionExecution"("clusterKey", "createdAt");
