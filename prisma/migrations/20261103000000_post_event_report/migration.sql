-- AlterTable
ALTER TABLE "BEO" ADD COLUMN     "actualCount" INTEGER;

-- AlterTable
ALTER TABLE "Function" ADD COLUMN     "actualAttendance" INTEGER;

-- CreateTable
CREATE TABLE "EventPostEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "naSections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "narrative" JSONB NOT NULL DEFAULT '{}',
    "primaryFacilityType" TEXT,
    "offsiteVenueUsed" BOOLEAN,
    "onSiteRegistrations" INTEGER,
    "noShows" INTEGER,
    "exhibitorsAttending" INTEGER,
    "domesticAttendees" INTEGER,
    "internationalAttendees" INTEGER,
    "shuttleProvided" BOOLEAN,
    "usedDmcPco" BOOLEAN,
    "guestPrograms" BOOLEAN,
    "usedSleepingRooms" BOOLEAN,
    "hotelCount" INTEGER,
    "peakNightRooms" INTEGER,
    "housingPerformedBy" TEXT,
    "icwFunctions" BOOLEAN,
    "largestFunctionAvSetup" TEXT,
    "extensiveAvRooms" INTEGER,
    "registrationAreas" INTEGER,
    "lounges" INTEGER,
    "offices" INTEGER,
    "moveInDays" INTEGER,
    "moveOutDays" INTEGER,
    "teardownDays" INTEGER,
    "gscUsed" BOOLEAN,
    "gscMoveInDays" INTEGER,
    "exhibitorsWithFb" INTEGER,
    "extensiveAvExhibitors" INTEGER,
    "futureDatesConfirmed" BOOLEAN,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPostEventFutureDate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "facility" TEXT,
    "comments" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPostEventFutureDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPostEventDistribution" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionDate" DATE,
    "byName" TEXT,
    "byTitle" TEXT,
    "byEmployer" TEXT,
    "method" TEXT,
    "deliveredOn" DATE,
    "recipients" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPostEventDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventPostEvent_eventId_key" ON "EventPostEvent"("eventId");

-- CreateIndex
CREATE INDEX "EventPostEvent_updatedById_idx" ON "EventPostEvent"("updatedById");

-- CreateIndex
CREATE INDEX "EventPostEventFutureDate_eventId_idx" ON "EventPostEventFutureDate"("eventId");

-- CreateIndex
CREATE INDEX "EventPostEventDistribution_eventId_idx" ON "EventPostEventDistribution"("eventId");

-- AddForeignKey
ALTER TABLE "EventPostEvent" ADD CONSTRAINT "EventPostEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPostEvent" ADD CONSTRAINT "EventPostEvent_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPostEventFutureDate" ADD CONSTRAINT "EventPostEventFutureDate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPostEventDistribution" ADD CONSTRAINT "EventPostEventDistribution_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

