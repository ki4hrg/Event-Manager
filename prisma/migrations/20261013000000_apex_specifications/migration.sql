-- CreateEnum
CREATE TYPE "ProvidedBy" AS ENUM ('NOT_REQUIRED', 'GROUP', 'VENUE', 'OUTSIDE_VENDOR');

-- AlterTable
ALTER TABLE "BEO" ADD COLUMN     "mealType" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "actualAttendance" INTEGER,
ADD COLUMN     "expectedAttendance" INTEGER,
ADD COLUMN     "functionNumbersLockedAt" TIMESTAMP(3),
ADD COLUMN     "isMembershipBased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "membershipCount" INTEGER;

-- AlterTable
ALTER TABLE "EventKeyStaff" ADD COLUMN     "approvalAuthority" TEXT,
ADD COLUMN     "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onSite" BOOLEAN,
ADD COLUMN     "responsibilities" TEXT;

-- AlterTable
ALTER TABLE "Function" ADD COLUMN     "billingNotes" TEXT,
ADD COLUMN     "costCenter" TEXT,
ADD COLUMN     "decorNotes" TEXT,
ADD COLUMN     "expectedAttendance" INTEGER,
ADD COLUMN     "functionNumber" TEXT,
ADD COLUMN     "functionNumberPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hold24Hour" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "postToReaderBoard" BOOLEAN,
ADD COLUMN     "readerBoardText" TEXT,
ADD COLUMN     "securityNotes" TEXT,
ADD COLUMN     "setForCount" INTEGER,
ADD COLUMN     "signageNotes" TEXT;

-- CreateTable
CREATE TABLE "EventSpecification" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dateOriginated" DATE,
    "dateRevised" DATE,
    "naSections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "narrative" JSONB NOT NULL DEFAULT '{}',
    "eventType" TEXT,
    "eventScope" TEXT,
    "eventFrequency" TEXT,
    "isMandatory" BOOLEAN,
    "spousesInvited" BOOLEAN,
    "childrenInvited" BOOLEAN,
    "preMeetingAt" TIMESTAMP(3),
    "postMeetingAt" TIMESTAMP(3),
    "moveInRequired" BOOLEAN,
    "preRegisteredCount" INTEGER,
    "domesticCount" INTEGER,
    "internationalCount" INTEGER,
    "exhibitorCount" INTEGER,
    "domesticExhibitors" INTEGER,
    "internationalExhibitors" INTEGER,
    "exhibitingCompanies" INTEGER,
    "thirdPartyHousing" BOOLEAN,
    "reservationMethod" TEXT,
    "masterExhibitFunctionId" TEXT,
    "grossSqFt" INTEGER,
    "netSqFt" INTEGER,
    "povDeliveries" INTEGER,
    "rulesAttached" BOOLEAN,
    "exhibitorMoveInStart" TIMESTAMP(3),
    "exhibitorMoveInEnd" TIMESTAMP(3),
    "exhibitorMoveOutStart" TIMESTAMP(3),
    "exhibitorMoveOutEnd" TIMESTAMP(3),
    "contractorMoveInStart" TIMESTAMP(3),
    "contractorMoveInEnd" TIMESTAMP(3),
    "contractorMoveOutStart" TIMESTAMP(3),
    "contractorMoveOutEnd" TIMESTAMP(3),
    "securityProvider" "ProvidedBy",
    "securityVendorId" TEXT,
    "firstAidProvider" "ProvidedBy",
    "firstAidVendorId" TEXT,
    "attendeeShuttle" BOOLEAN,
    "offsiteShuttles" BOOLEAN,
    "transportationVendorId" TEXT,
    "finalBillContactId" TEXT,
    "taxExempt" BOOLEAN,
    "roomTaxToMaster" BOOLEAN,
    "incidentalsToMaster" BOOLEAN,
    "guestsPayOwn" BOOLEAN,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSpecVip" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "employer" TEXT,
    "contactId" TEXT,
    "arrivalAt" TIMESTAMP(3),
    "departureAt" TIMESTAMP(3),
    "amenities" TEXT,
    "upgrades" TEXT,
    "relationship" TEXT,
    "comments" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSpecVip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSpecShuttleRoute" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "frequency" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSpecShuttleRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSpecTransfer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "functionId" TEXT,
    "label" TEXT NOT NULL,
    "departureLocation" TEXT,
    "departureAt" TIMESTAMP(3),
    "dropoffLocation" TEXT,
    "dropoffAt" TIMESTAMP(3),
    "returnLocation" TEXT,
    "returnAt" TIMESTAMP(3),
    "provider" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSpecTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSpecShipment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fromText" TEXT,
    "toText" TEXT,
    "shipper" TEXT,
    "itemCount" INTEGER,
    "expectedDelivery" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSpecShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSpecCoverage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "location" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSpecCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSpecKey" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "location" TEXT,
    "functionId" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "quantity" INTEGER,
    "rekeyed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSpecKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetiredFunctionNumber" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetiredFunctionNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunctionRoomNumber" (
    "id" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "suffix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunctionRoomNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventSpecification_eventId_key" ON "EventSpecification"("eventId");

-- CreateIndex
CREATE INDEX "EventSpecification_masterExhibitFunctionId_idx" ON "EventSpecification"("masterExhibitFunctionId");

-- CreateIndex
CREATE INDEX "EventSpecification_securityVendorId_idx" ON "EventSpecification"("securityVendorId");

-- CreateIndex
CREATE INDEX "EventSpecification_firstAidVendorId_idx" ON "EventSpecification"("firstAidVendorId");

-- CreateIndex
CREATE INDEX "EventSpecification_transportationVendorId_idx" ON "EventSpecification"("transportationVendorId");

-- CreateIndex
CREATE INDEX "EventSpecification_finalBillContactId_idx" ON "EventSpecification"("finalBillContactId");

-- CreateIndex
CREATE INDEX "EventSpecification_updatedById_idx" ON "EventSpecification"("updatedById");

-- CreateIndex
CREATE INDEX "EventSpecVip_eventId_idx" ON "EventSpecVip"("eventId");

-- CreateIndex
CREATE INDEX "EventSpecVip_contactId_idx" ON "EventSpecVip"("contactId");

-- CreateIndex
CREATE INDEX "EventSpecShuttleRoute_eventId_idx" ON "EventSpecShuttleRoute"("eventId");

-- CreateIndex
CREATE INDEX "EventSpecTransfer_eventId_idx" ON "EventSpecTransfer"("eventId");

-- CreateIndex
CREATE INDEX "EventSpecTransfer_functionId_idx" ON "EventSpecTransfer"("functionId");

-- CreateIndex
CREATE INDEX "EventSpecShipment_eventId_idx" ON "EventSpecShipment"("eventId");

-- CreateIndex
CREATE INDEX "EventSpecCoverage_eventId_idx" ON "EventSpecCoverage"("eventId");

-- CreateIndex
CREATE INDEX "EventSpecKey_eventId_idx" ON "EventSpecKey"("eventId");

-- CreateIndex
CREATE INDEX "EventSpecKey_functionId_idx" ON "EventSpecKey"("functionId");

-- CreateIndex
CREATE UNIQUE INDEX "RetiredFunctionNumber_eventId_number_key" ON "RetiredFunctionNumber"("eventId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "FunctionRoomNumber_functionId_roomId_key" ON "FunctionRoomNumber"("functionId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "FunctionRoomNumber_functionId_suffix_key" ON "FunctionRoomNumber"("functionId", "suffix");

-- CreateIndex
CREATE UNIQUE INDEX "Function_eventId_functionNumber_key" ON "Function"("eventId", "functionNumber");

-- AddForeignKey
ALTER TABLE "EventSpecification" ADD CONSTRAINT "EventSpecification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecification" ADD CONSTRAINT "EventSpecification_masterExhibitFunctionId_fkey" FOREIGN KEY ("masterExhibitFunctionId") REFERENCES "Function"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecification" ADD CONSTRAINT "EventSpecification_securityVendorId_fkey" FOREIGN KEY ("securityVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecification" ADD CONSTRAINT "EventSpecification_firstAidVendorId_fkey" FOREIGN KEY ("firstAidVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecification" ADD CONSTRAINT "EventSpecification_transportationVendorId_fkey" FOREIGN KEY ("transportationVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecification" ADD CONSTRAINT "EventSpecification_finalBillContactId_fkey" FOREIGN KEY ("finalBillContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecification" ADD CONSTRAINT "EventSpecification_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecVip" ADD CONSTRAINT "EventSpecVip_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecVip" ADD CONSTRAINT "EventSpecVip_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecShuttleRoute" ADD CONSTRAINT "EventSpecShuttleRoute_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecTransfer" ADD CONSTRAINT "EventSpecTransfer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecTransfer" ADD CONSTRAINT "EventSpecTransfer_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecShipment" ADD CONSTRAINT "EventSpecShipment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecCoverage" ADD CONSTRAINT "EventSpecCoverage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecKey" ADD CONSTRAINT "EventSpecKey_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpecKey" ADD CONSTRAINT "EventSpecKey_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetiredFunctionNumber" ADD CONSTRAINT "RetiredFunctionNumber_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionRoomNumber" ADD CONSTRAINT "FunctionRoomNumber_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionRoomNumber" ADD CONSTRAINT "FunctionRoomNumber_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Data: APEX vocabularies for existing tenants ──────────────────────────
-- New categories seed themselves (prisma/tenantDefaults.mjs runs on every
-- deploy and only fills empty categories). function_type and setup_type
-- already have rows, so add the APEX labels here once. Additive only: existing
-- labels are never renamed, and labels that duplicate one the tenant already
-- has (case-insensitively, or a known equivalent) are skipped.
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'General Session', 100 + 0, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('General Session') OR o."label" = 'Plenary Session'))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Break Out', 100 + 1, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Break Out') OR o."label" = 'Breakout Session'))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Workshop', 100 + 2, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Workshop')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Meeting', 100 + 3, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Meeting') OR o."label" = 'General'))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Meal / Catering Order', 100 + 4, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Meal / Catering Order')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Exhibit', 100 + 5, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Exhibit')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Poster Session', 100 + 6, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Poster Session')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Registration', 100 + 7, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Registration')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Speaker Room', 100 + 8, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Speaker Room')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Dressing/Green Room', 100 + 9, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Dressing/Green Room')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Office', 100 + 10, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Office')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Photo Room', 100 + 11, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Photo Room')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Coat Check', 100 + 12, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Coat Check')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Storage', 100 + 13, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Storage')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'function_type', 'Other', 100 + 14, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'function_type' AND (lower(o."label") = lower('Other')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Theater', 100 + 0, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Theater')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Theater - Semi-circle', 100 + 1, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Theater - Semi-circle')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Theater - Chevron', 100 + 2, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Theater - Chevron')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Classroom - 2 per 6 ft. tables', 100 + 3, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Classroom - 2 per 6 ft. tables')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Classroom - 3 per 6 ft. tables', 100 + 4, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Classroom - 3 per 6 ft. tables')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Classroom - 3 per 8 ft. tables', 100 + 5, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Classroom - 3 per 8 ft. tables')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Classroom - 4 per 8 ft. tables', 100 + 6, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Classroom - 4 per 8 ft. tables')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Classroom (Chevron) - 2 per 6 ft. tables', 100 + 7, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Classroom (Chevron) - 2 per 6 ft. tables')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Classroom (Chevron) - 3 per 6 ft. tables', 100 + 8, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Classroom (Chevron) - 3 per 6 ft. tables')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Classroom (Chevron) - 3 per 8 ft. tables', 100 + 9, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Classroom (Chevron) - 3 per 8 ft. tables')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Classroom (Chevron) - 4 per 8 ft. tables', 100 + 10, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Classroom (Chevron) - 4 per 8 ft. tables')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Banquet Rounds for 8', 100 + 11, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Banquet Rounds for 8')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Banquet Rounds for 10', 100 + 12, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Banquet Rounds for 10')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Banquet Rounds for 12', 100 + 13, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Banquet Rounds for 12')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Crescent Rounds', 100 + 14, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Crescent Rounds')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Crescent Rounds of 5', 100 + 15, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Crescent Rounds of 5')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Crescent Rounds of 6', 100 + 16, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Crescent Rounds of 6')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Cocktail Rounds', 100 + 17, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Cocktail Rounds')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Board Room (Conference)', 100 + 18, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Board Room (Conference)')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Royal conference', 100 + 19, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Royal conference')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Hollow Square', 100 + 20, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Hollow Square')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'U-shaped', 100 + 21, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('U-shaped') OR o."label" = 'U-Shape'))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'T-shaped', 100 + 22, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('T-shaped')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'E-shaped', 100 + 23, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('E-shaped')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Talk Show', 100 + 24, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Talk Show')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Perimeter Seating', 100 + 25, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Perimeter Seating')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Flow (no tables or chairs)', 100 + 26, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Flow (no tables or chairs)') OR o."label" = 'Reception / Standing'))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Registration', 100 + 27, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Registration')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Existing', 100 + 28, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Existing') OR o."label" = 'Fixed in Room'))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', '10x10 exhibits', 100 + 29, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('10x10 exhibits')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', '8x10 exhibits', 100 + 30, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('8x10 exhibits')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Island Exhibit', 100 + 31, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Island Exhibit')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Peninsula Exhibit', 100 + 32, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Peninsula Exhibit')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Perimeter Exhibit', 100 + 33, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Perimeter Exhibit')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Tabletop exhibits', 100 + 34, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Tabletop exhibits')))
ON CONFLICT DO NOTHING;
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'setup_type', 'Other', 100 + 35, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type')
  AND NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'setup_type' AND (lower(o."label") = lower('Other')))
ON CONFLICT DO NOTHING;

-- Mark the ESG set-up / dismantle schedule types so the derivation survives renames.
UPDATE "CustomOption" SET "group" = 'SETUP' WHERE "category" = 'schedule_type' AND "label" = 'Setup' AND "group" IS NULL;
UPDATE "CustomOption" SET "group" = 'TEARDOWN' WHERE "category" = 'schedule_type' AND "label" = 'Breakdown' AND "group" IS NULL;
