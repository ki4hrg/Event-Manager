-- Email ingest: per-event inbox addresses (Event.inboxSlug, unique per
-- tenant) and the InboundEmail queue; attachments and the raw .eml are
-- FileUploads on it. See docs/proposals/email-ingest.md.
-- CreateEnum
CREATE TYPE "InboundOrigin" AS ENUM ('EMAIL', 'MCP');

-- CreateEnum
CREATE TYPE "InboundStatus" AS ENUM ('HELD', 'RECEIVED', 'PARSED', 'APPLIED', 'DISMISSED', 'FAILED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "inboxSlug" TEXT;

-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "inboundEmailId" TEXT;

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "origin" "InboundOrigin" NOT NULL DEFAULT 'EMAIL',
    "dedupKey" TEXT NOT NULL,
    "envelopeTo" TEXT NOT NULL,
    "envelopeFrom" TEXT,
    "sender" TEXT NOT NULL,
    "senderAddress" TEXT,
    "forwardedFrom" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "textBody" TEXT,
    "authResults" TEXT,
    "senderMatch" TEXT,
    "status" "InboundStatus" NOT NULL,
    "kind" TEXT,
    "proposal" JSONB,
    "model" TEXT,
    "error" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_dedupKey_key" ON "InboundEmail"("dedupKey");

-- CreateIndex
CREATE INDEX "InboundEmail_tenantId_eventId_status_idx" ON "InboundEmail"("tenantId", "eventId", "status");

-- CreateIndex
CREATE INDEX "InboundEmail_eventId_status_idx" ON "InboundEmail"("eventId", "status");

-- CreateIndex
CREATE INDEX "InboundEmail_handledById_idx" ON "InboundEmail"("handledById");

-- CreateIndex
CREATE UNIQUE INDEX "Event_tenantId_inboxSlug_key" ON "Event"("tenantId", "inboxSlug");

-- CreateIndex
CREATE INDEX "FileUpload_inboundEmailId_idx" ON "FileUpload"("inboundEmailId");

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

