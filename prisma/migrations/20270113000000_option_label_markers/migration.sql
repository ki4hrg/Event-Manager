-- Fixed values out of option-label columns (#210).

-- 1. An inbound email's raw .eml was marked by FileUpload.fileType
--    'EMAIL_SOURCE', a column that otherwise holds file_type option labels.
--    It gets its own flag.
ALTER TABLE "FileUpload" ADD COLUMN "isEmailSource" BOOLEAN NOT NULL DEFAULT false;

UPDATE "FileUpload"
SET "isEmailSource" = true, "fileType" = NULL
WHERE "fileType" = 'EMAIL_SOURCE' AND "inboundEmailId" IS NOT NULL;

-- 2. Issued RFPs are filed under the file_type option whose group is 'RFP'
--    (src/lib/fileTypes.ts), so a renamed option keeps receiving them. Key
--    each tenant's "RFP" option, unless one already carries the group ...
UPDATE "CustomOption" o
SET "group" = 'RFP', "updatedAt" = CURRENT_TIMESTAMP
WHERE o."category" = 'file_type'
  AND o."label" = 'RFP'
  AND o."group" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CustomOption" g
    WHERE g."tenantId" = o."tenantId" AND g."category" = 'file_type' AND g."group" = 'RFP'
  );

-- ... and give tenants seeded before "RFP" was a default the option, so the
-- copies they already issued (fileType 'RFP') have a real type.
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "group", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'file_type', 'RFP', 'RFP',
  COALESCE((SELECT MAX(x."sortOrder") + 1 FROM "CustomOption" x WHERE x."tenantId" = t."id" AND x."category" = 'file_type'), 0),
  CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "CustomOption" o
  WHERE o."tenantId" = t."id" AND o."category" = 'file_type' AND (o."group" = 'RFP' OR o."label" = 'RFP')
);

-- 3. Exhibit Request links stored the booth types they offer as labels
--    (config.options.boothTypes), which a rename broke. They become option
--    ids (config.options.boothTypeIds). A label no longer on file drops out,
--    as it already did when the form was opened.
UPDATE "FormLink" fl
SET "config" = jsonb_set(
  fl."config" #- '{options,boothTypes}',
  '{options,boothTypeIds}',
  COALESCE(
    (
      SELECT jsonb_agg(co."id" ORDER BY co."sortOrder", co."id")
      FROM "CustomOption" co
      WHERE co."tenantId" = fl."tenantId"
        AND co."category" = 'booth_type'
        AND co."label" IN (SELECT jsonb_array_elements_text(fl."config" -> 'options' -> 'boothTypes'))
    ),
    '[]'::jsonb
  )
)
WHERE fl."formType" = 'EXHIBIT_REQUEST'
  AND jsonb_typeof(fl."config" -> 'options') = 'object'
  AND jsonb_typeof(fl."config" -> 'options' -> 'boothTypes') = 'array';
