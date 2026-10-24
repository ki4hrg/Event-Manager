-- Custom roles got no level for HOTELS and FORMS when those resources were
-- added (the seed rewrites only system roles), so their users silently lost
-- the sections. Give every non-system role, per scope it has no row for, the
-- level its EVENTS row holds at that scope. Rows already set are kept.

-- Data migration
INSERT INTO "RolePermission" ("id", "roleId", "resource", "scope", "level")
SELECT gen_random_uuid()::text, rp."roleId", r.resource::"PermissionResource", rp."scope", rp."level"
FROM "RolePermission" rp
JOIN "Role" ro ON ro."id" = rp."roleId" AND ro."isSystem" = false
CROSS JOIN (VALUES ('HOTELS'), ('FORMS')) AS r(resource)
WHERE rp."resource" = 'EVENTS'
ON CONFLICT ("roleId", "resource", "scope") DO NOTHING;
