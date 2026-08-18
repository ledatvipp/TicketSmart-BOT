-- Disable legacy schema-only TOTP markers; they were never enforced during login and secrets were plaintext.
UPDATE "Staff" SET "totpSecret" = NULL, "totpEnabled" = false;

-- Idempotency cho retry khi Discord/API timeout giữa quá trình tạo ticket.
ALTER TABLE "Ticket" ADD COLUMN "creationKey" TEXT;
CREATE UNIQUE INDEX "Ticket_creationKey_key" ON "Ticket"("creationKey");

-- Security and reliability hardening: atomic ticket creation lock and durable webhook outbox.
CREATE TABLE "TicketCreationLock" (
  "creatorId" TEXT NOT NULL PRIMARY KEY,
  "touchedAt" DATETIME NOT NULL
);

CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "webhookId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" DATETIME,
  "lastError" TEXT,
  "responseStatus" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" DATETIME,
  CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt");
