-- Contract types become a per-tenant option list, hotel_contract_type (#175).
-- An option's group says whether the type carries attrition: CONTRACT does,
-- COURTESY doesn't. Each tenant gets the two former enum values as options,
-- and the columns keep their rows as those labels.
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "group", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'hotel_contract_type', d."label", d."group", d."ord", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES ('Contract', 'CONTRACT', 0), ('Courtesy', 'COURTESY', 1)) AS d("label", "group", "ord")
WHERE NOT EXISTS (
  SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'hotel_contract_type' AND o."label" = d."label"
);

ALTER TABLE "HotelProposal" ALTER COLUMN "contractType" TYPE TEXT
  USING (CASE "contractType"::text WHEN 'CONTRACT' THEN 'Contract' WHEN 'COURTESY' THEN 'Courtesy' END);

ALTER TABLE "RfpHotelBlock" ALTER COLUMN "contractType" TYPE TEXT
  USING (CASE "contractType"::text WHEN 'CONTRACT' THEN 'Contract' WHEN 'COURTESY' THEN 'Courtesy' END);

DROP TYPE "HotelContractType";
