ALTER TABLE "Ticket" ADD COLUMN "moveCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ticket" ADD COLUMN "lastMovedAt" DATETIME;
ALTER TABLE "Ticket" ADD COLUMN "lastMovedBy" TEXT;

CREATE TABLE "TicketMove" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT NOT NULL,
  "fromOptionId" TEXT,
  "fromOptionName" TEXT,
  "toOptionId" TEXT NOT NULL,
  "toOptionName" TEXT NOT NULL,
  "fromCategoryId" TEXT,
  "toCategoryId" TEXT,
  "movedById" TEXT NOT NULL,
  "movedByName" TEXT NOT NULL,
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'discord',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketMove_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TicketMove_ticketId_createdAt_idx" ON "TicketMove"("ticketId", "createdAt");
CREATE INDEX "TicketMove_fromOptionId_idx" ON "TicketMove"("fromOptionId");
CREATE INDEX "TicketMove_toOptionId_idx" ON "TicketMove"("toOptionId");
CREATE INDEX "TicketMove_movedById_idx" ON "TicketMove"("movedById");
CREATE INDEX "TicketMove_createdAt_idx" ON "TicketMove"("createdAt");
