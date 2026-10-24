-- Cost centers become a per-tenant option list (#209), seeded from the
-- distinct values each tenant's functions, booths and booth groups hold.
-- Stored values are trimmed first so each matches its option exactly.
UPDATE "Function" SET "costCenter" = NULLIF(btrim("costCenter"), '') WHERE "costCenter" IS DISTINCT FROM NULLIF(btrim("costCenter"), '');
UPDATE "ExhibitBooth" SET "costCenter" = NULLIF(btrim("costCenter"), '') WHERE "costCenter" IS DISTINCT FROM NULLIF(btrim("costCenter"), '');
UPDATE "ExhibitBoothGroup" SET "costCenter" = NULLIF(btrim("costCenter"), '') WHERE "costCenter" IS DISTINCT FROM NULLIF(btrim("costCenter"), '');

INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, u."tenantId", 'cost_center', u."label",
  (ROW_NUMBER() OVER (PARTITION BY u."tenantId" ORDER BY u."label") - 1)::int,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT e."tenantId", x."costCenter" AS "label"
  FROM (
    SELECT "eventId", "costCenter" FROM "Function"
    UNION ALL SELECT "eventId", "costCenter" FROM "ExhibitBooth"
    UNION ALL SELECT "eventId", "costCenter" FROM "ExhibitBoothGroup"
  ) x
  JOIN "Event" e ON e."id" = x."eventId"
  WHERE x."costCenter" IS NOT NULL
) u
WHERE NOT EXISTS (
  SELECT 1 FROM "CustomOption" o
  WHERE o."tenantId" = u."tenantId" AND o."category" = 'cost_center' AND o."label" = u."label"
);
