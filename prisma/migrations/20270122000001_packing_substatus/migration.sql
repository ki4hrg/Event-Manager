-- Packing sub-states (#211): a per-tenant option list grouped by PackingStatus,
-- stored as a label beside each packing status column. Each tenant without the
-- list gets the defaults (as prisma/tenantDefaults.mjs).

-- AlterTable
ALTER TABLE "PrintItem" ADD COLUMN     "packingSubstatus" TEXT;

-- AlterTable
ALTER TABLE "PrintOrder" ADD COLUMN     "packingSubstatus" TEXT;

-- AlterTable
ALTER TABLE "SupplyOrderItem" ADD COLUMN     "packingSubstatus" TEXT;

-- packing_substatus defaults
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "group", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'packing_substatus', d."label", d."group", 0, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES ('Packed', 'NEEDED'), ('Shipped', 'IN_TRANSIT'), ('Returned', 'DELIVERED')) AS d("label", "group")
WHERE NOT EXISTS (
  SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'packing_substatus'
);
