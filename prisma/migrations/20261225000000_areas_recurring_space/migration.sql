-- Areas move to event settings and can name whole regions; RFP rows can
-- repeat daily through an end day; an RFP's history can show only blocks
-- like its own.

-- AlterTable: keep any hotel areas already set on events.
ALTER TABLE "Event" RENAME COLUMN "hotelAreas" TO "areas";
ALTER TABLE "Event" ADD COLUMN "regions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Rfp" ADD COLUMN "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "historyMatching" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RfpSpaceRequest" ADD COLUMN "endDay" DATE;
