-- Units (catering and RFP line items) and guest charge types become per-tenant
-- option lists (#207). Stored values are trimmed so each matches its option;
-- each tenant gets the defaults (as prisma/tenantDefaults.mjs) followed by the
-- distinct values it already uses.
UPDATE "BEOLineItem" SET "unitType" = NULLIF(btrim("unitType"), '') WHERE "unitType" IS DISTINCT FROM NULLIF(btrim("unitType"), '');
UPDATE "RfpLineItem" SET "unit" = NULLIF(btrim("unit"), '') WHERE "unit" IS DISTINCT FROM NULLIF(btrim("unit"), '');
UPDATE "HotelCharge" SET "chargeType" = btrim("chargeType") WHERE "chargeType" <> btrim("chargeType");

-- unit
WITH defaults("label", "ord") AS (
  VALUES ('each', 0), ('per person', 1), ('guests', 2), ('flat', 3), ('per hour', 4), ('per day', 5)
),
used AS (
  SELECT DISTINCT e."tenantId", li."unitType" AS "label"
  FROM "BEOLineItem" li
  JOIN "BEO" co ON co."id" = li."beoId"
  JOIN "Event" e ON e."id" = co."eventId"
  WHERE li."unitType" IS NOT NULL
  UNION
  SELECT DISTINCT e."tenantId", li."unit"
  FROM "RfpLineItem" li
  JOIN "Rfp" r ON r."id" = li."rfpId"
  JOIN "Event" e ON e."id" = r."eventId"
  WHERE li."unit" IS NOT NULL
),
wanted AS (
  SELECT t."id" AS "tenantId", d."label", d."ord" FROM "Tenant" t CROSS JOIN defaults d
  UNION ALL
  SELECT u."tenantId", u."label", 1000 FROM used u
  WHERE NOT EXISTS (SELECT 1 FROM defaults d WHERE d."label" = u."label")
)
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, w."tenantId", 'unit', w."label",
  (ROW_NUMBER() OVER (PARTITION BY w."tenantId" ORDER BY w."ord", w."label") - 1)::int,
  CURRENT_TIMESTAMP
FROM wanted w
WHERE NOT EXISTS (
  SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = w."tenantId" AND o."category" = 'unit' AND o."label" = w."label"
);

-- hotel_charge: guest charges on proposals and blocks; group is the default
-- scope, the one each type is most often stored with.
WITH defaults("label", "scope", "ord") AS (
  VALUES ('Resort fee', 'PER_NIGHT', 0), ('Destination fee', 'PER_NIGHT', 1), ('Parking', 'PER_NIGHT', 2),
    ('Valet parking', 'PER_NIGHT', 3), ('Early departure fee', 'PER_STAY', 4)
),
charges AS (
  SELECT e."tenantId", c."chargeType" AS "label", c."scope"::text AS "scope"
  FROM "HotelCharge" c
  LEFT JOIN "HotelBlock" b ON b."id" = c."blockId"
  JOIN "HotelProposal" p ON p."id" = COALESCE(c."proposalId", b."proposalId")
  JOIN "Event" e ON e."id" = p."eventId"
  WHERE c."kind" = 'GUEST' AND c."chargeType" <> ''
),
used AS (
  SELECT DISTINCT ON ("tenantId", "label") "tenantId", "label", "scope"
  FROM (
    SELECT "tenantId", "label", "scope", count(*) AS n FROM charges GROUP BY "tenantId", "label", "scope"
  ) x
  ORDER BY "tenantId", "label", ("scope" IS NULL), n DESC, "scope"
),
wanted AS (
  SELECT t."id" AS "tenantId", d."label", d."scope", d."ord" FROM "Tenant" t CROSS JOIN defaults d
  UNION ALL
  SELECT u."tenantId", u."label", u."scope", 1000 FROM used u
  WHERE NOT EXISTS (SELECT 1 FROM defaults d WHERE d."label" = u."label")
)
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "group", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, w."tenantId", 'hotel_charge', w."label", w."scope",
  (ROW_NUMBER() OVER (PARTITION BY w."tenantId" ORDER BY w."ord", w."label") - 1)::int,
  CURRENT_TIMESTAMP
FROM wanted w
WHERE NOT EXISTS (
  SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = w."tenantId" AND o."category" = 'hotel_charge' AND o."label" = w."label"
);
