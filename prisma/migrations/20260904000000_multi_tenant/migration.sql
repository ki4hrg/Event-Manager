-- Multi-tenancy.
--
-- Hand-edited from `prisma migrate diff` so it is safe on a populated
-- database: every tenant-owned table gains a nullable "tenantId", existing rows
-- are attached to a "Default" tenant, and only then is the column made NOT NULL.
-- The per-user global role becomes a TenantMembership row in that default
-- tenant, and users holding the system Admin role become platform super admins.

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

-- CreateIndex
CREATE INDEX "TenantMembership_roleId_idx" ON "TenantMembership"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Default tenant. Every pre-existing row is attached to it below; the seed
-- looks it up by slug and a super admin can rename it afterwards.
INSERT INTO "Tenant" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('default', 'Default', 'default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Tenant column on every tenant-owned table: add nullable, backfill, then
-- tighten. Adding NOT NULL directly fails on any table with rows.
ALTER TABLE "CustomOption" ADD COLUMN "tenantId" TEXT;
UPDATE "CustomOption" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "CustomOption" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Equipment" ADD COLUMN "tenantId" TEXT;
UPDATE "Equipment" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "Equipment" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "StorageLocation" ADD COLUMN "tenantId" TEXT;
UPDATE "StorageLocation" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "StorageLocation" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "InventoryItem" ADD COLUMN "tenantId" TEXT;
UPDATE "InventoryItem" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "EventSeries" ADD COLUMN "tenantId" TEXT;
UPDATE "EventSeries" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "EventSeries" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Event" ADD COLUMN "tenantId" TEXT;
UPDATE "Event" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "Event" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Venue" ADD COLUMN "tenantId" TEXT;
UPDATE "Venue" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "Venue" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Contact" ADD COLUMN "tenantId" TEXT;
UPDATE "Contact" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "Contact" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "WorkflowTemplate" ADD COLUMN "tenantId" TEXT;
UPDATE "WorkflowTemplate" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "WorkflowTemplate" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Vendor" ADD COLUMN "tenantId" TEXT;
UPDATE "Vendor" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "Vendor" ALTER COLUMN "tenantId" SET NOT NULL;

-- Uniqueness now lives inside a tenant.
DROP INDEX "CustomOption_category_label_key";
DROP INDEX "Equipment_category_name_key";
DROP INDEX "EventSeries_name_key";

-- CreateIndex
CREATE INDEX "CustomOption_tenantId_idx" ON "CustomOption"("tenantId");
CREATE UNIQUE INDEX "CustomOption_tenantId_category_label_key" ON "CustomOption"("tenantId", "category", "label");
CREATE INDEX "Equipment_tenantId_idx" ON "Equipment"("tenantId");
CREATE UNIQUE INDEX "Equipment_tenantId_category_name_key" ON "Equipment"("tenantId", "category", "name");
CREATE INDEX "StorageLocation_tenantId_idx" ON "StorageLocation"("tenantId");
CREATE INDEX "InventoryItem_tenantId_idx" ON "InventoryItem"("tenantId");
CREATE INDEX "EventSeries_tenantId_idx" ON "EventSeries"("tenantId");
CREATE UNIQUE INDEX "EventSeries_tenantId_name_key" ON "EventSeries"("tenantId", "name");
CREATE INDEX "Event_tenantId_idx" ON "Event"("tenantId");
CREATE INDEX "Venue_tenantId_idx" ON "Venue"("tenantId");
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");
CREATE INDEX "WorkflowTemplate_tenantId_idx" ON "WorkflowTemplate"("tenantId");
CREATE INDEX "Vendor_tenantId_idx" ON "Vendor"("tenantId");

-- AddForeignKey
ALTER TABLE "CustomOption" ADD CONSTRAINT "CustomOption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Users: the old global role becomes a membership in the default tenant, and
-- holders of the system Admin role become platform super admins.
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "roleId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'default', "id", "roleId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
WHERE "roleId" IS NOT NULL;

UPDATE "User" SET "isSuperAdmin" = true
WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "name" = 'Admin' AND "isSystem" = true);

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "roleId";
