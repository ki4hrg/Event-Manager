-- Mark the main schedule type through CustomOption.group (#202). Function
-- lists used to find it by a label containing "main"; tag the same options so
-- existing tenants keep that grouping after a rename. Tenants that already
-- tag one are left alone, as are options grouped SETUP / TEARDOWN.
UPDATE "CustomOption" o
SET "group" = 'MAIN'
WHERE o."category" = 'schedule_type'
  AND o."group" IS NULL
  AND lower(o."label") LIKE '%main%'
  AND NOT EXISTS (
    SELECT 1 FROM "CustomOption" m
    WHERE m."tenantId" = o."tenantId" AND m."category" = 'schedule_type' AND m."group" = 'MAIN'
  );
