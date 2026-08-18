-- v7.3.2: OpenRouter provider settings + encrypted credential storage.
ALTER TABLE "GuildConfig" ADD COLUMN "aiProvider" TEXT NOT NULL DEFAULT 'openrouter';
ALTER TABLE "GuildConfig" ADD COLUMN "openRouterModel" TEXT NOT NULL DEFAULT 'google/gemma-4-26b-a4b-it:free';
ALTER TABLE "GuildConfig" ADD COLUMN "openRouterAnswerModel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GuildConfig" ADD COLUMN "openRouterTriageModel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GuildConfig" ADD COLUMN "openRouterEmbeddingModel" TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small';
ALTER TABLE "GuildConfig" ADD COLUMN "openRouterReasoningEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuildConfig" ADD COLUMN "openRouterReasoningEffort" TEXT NOT NULL DEFAULT 'low';

CREATE TABLE "AiProviderCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyCiphertext" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL DEFAULT '',
    "keyFingerprint" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastTestedAt" DATETIME,
    "lastTestStatus" TEXT
);

CREATE UNIQUE INDEX "AiProviderCredential_guildId_provider_key" ON "AiProviderCredential"("guildId", "provider");
CREATE INDEX "AiProviderCredential_guildId_idx" ON "AiProviderCredential"("guildId");
