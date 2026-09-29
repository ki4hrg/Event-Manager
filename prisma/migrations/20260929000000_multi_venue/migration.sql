-- Multi-venue events.
--
-- Hand-edited from `prisma migrate diff` so it is safe on a populated
-- database: the EventVenue junction is created and backfilled from
-- Event."venueId" (as each event's primary venue, sortOrder 0) before the
-- column is dropped.

-- CreateTable
CREATE TABLE "EventVenue" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventVenue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventVenue_venueId_idx" ON "EventVenue"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "EventVenue_eventId_venueId_key" ON "EventVenue"("eventId", "venueId");

-- AddForeignKey
ALTER TABLE "EventVenue" ADD CONSTRAINT "EventVenue_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenue" ADD CONSTRAINT "EventVenue_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every event's existing venue becomes its primary venue.
INSERT INTO "EventVenue" ("id", "eventId", "venueId", "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, "id", "venueId", 0, CURRENT_TIMESTAMP
FROM "Event"
WHERE "venueId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_venueId_fkey";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "venueId";
