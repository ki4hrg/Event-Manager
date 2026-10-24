-- Link setup table and chair types to the equipment catalog (#205). The
-- names stay as the shown text; the ids follow the catalog rows they name.
ALTER TABLE "SetupTable" ADD COLUMN "tableEquipmentId" TEXT;
ALTER TABLE "SetupTable" ADD COLUMN "chairEquipmentId" TEXT;

CREATE INDEX "SetupTable_tableEquipmentId_idx" ON "SetupTable"("tableEquipmentId");
CREATE INDEX "SetupTable_chairEquipmentId_idx" ON "SetupTable"("chairEquipmentId");

ALTER TABLE "SetupTable" ADD CONSTRAINT "SetupTable_tableEquipmentId_fkey" FOREIGN KEY ("tableEquipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SetupTable" ADD CONSTRAINT "SetupTable_chairEquipmentId_fkey" FOREIGN KEY ("chairEquipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the event's tenant's equipment of the same name, the Tables
-- (Chairs) category first. Names that match nothing stay free text.
UPDATE "SetupTable" st
SET "tableEquipmentId" = (
  SELECT eq."id"
  FROM "SetupOrder" so
  JOIN "Event" e ON e."id" = so."eventId"
  JOIN "Equipment" eq ON eq."tenantId" = e."tenantId"
  WHERE so."id" = st."setupOrderId" AND eq."name" = st."tableType"
  ORDER BY (eq."category" = 'Tables') DESC, eq."sortOrder", eq."id"
  LIMIT 1
)
WHERE st."tableType" IS NOT NULL;

UPDATE "SetupTable" st
SET "chairEquipmentId" = (
  SELECT eq."id"
  FROM "SetupOrder" so
  JOIN "Event" e ON e."id" = so."eventId"
  JOIN "Equipment" eq ON eq."tenantId" = e."tenantId"
  WHERE so."id" = st."setupOrderId" AND eq."name" = st."chairType"
  ORDER BY (eq."category" = 'Chairs') DESC, eq."sortOrder", eq."id"
  LIMIT 1
)
WHERE st."chairType" IS NOT NULL;
