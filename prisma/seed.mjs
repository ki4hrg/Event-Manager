import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedTenantDefaults } from "./tenantDefaults.mjs";

const prisma = new PrismaClient();

// Mirrored by src/app/users/roles/resources.ts PERMISSION_GROUPS. The seed
// runs outside the Next runtime so it can't import the TS module — when a new
// PermissionResource lands in schema.prisma, update both files.
const NON_EVENT_RESOURCES = [
  "ROLES",
  "USERS",
  "SETTINGS",
  "SYSTEM",
  "EQUIPMENT",
  "STORAGE_LOCATIONS",
  "WORKFLOWS",
  "VENDORS",
  "VENUES",
  "CONTACTS",
  "API_KEYS",
];

const EVENT_RESOURCES = [
  "EVENTS",
  "FUNCTIONS",
  "PRESENTATIONS",
  "AV_ORDERS",
  "CATERING_ORDERS",
  "SETUP_ORDERS",
  "PRINT_ORDERS",
  "SUPPLY_ORDERS",
  "MEDIA_DELIVERABLES",
  "FILES",
  "SHARE_LINKS",
  "HOTELS",
  "FORMS",
];

// Resources only granted to the Admin role by default. The seeded User role omits these (implicit NONE).
// STORAGE_LOCATIONS is deliberately absent: packers add and re-place containers
// during load-out, so the User role gets WRITE. DELETE stays admin-only, which
// leaves archiving as the field-safe way to retire a container.
const ADMIN_ONLY_RESOURCES = new Set([
  "ROLES",
  "USERS",
  "SETTINGS",
  "SYSTEM",
  "EQUIPMENT",
  "WORKFLOWS",
  "API_KEYS",
]);

// `level` is either a flat PermissionLevel applied everywhere, or a per-scope
// map { GLOBAL, ASSIGNED, UNASSIGNED } — the Viewer role needs to see the
// events it is assigned to and nothing else, which a single level can't express.
function buildPermissions(level, { adminOnly, globalLevel }) {
  const at = (scope) => (typeof level === "string" ? level : level[scope]);
  const perms = [];
  for (const resource of NON_EVENT_RESOURCES) {
    if (!adminOnly && ADMIN_ONLY_RESOURCES.has(resource)) continue;
    perms.push({ resource, scope: "GLOBAL", level: globalLevel ?? at("GLOBAL") });
  }
  for (const resource of EVENT_RESOURCES) {
    for (const scope of ["GLOBAL", "ASSIGNED", "UNASSIGNED"]) {
      perms.push({ resource, scope, level: at(scope) });
    }
  }
  return perms;
}

async function syncSystemRole(name, description, level, { adminOnly, globalLevel }) {
  const role = await prisma.role.upsert({
    where: { name },
    update: { description, isSystem: true },
    create: { name, description, isSystem: true },
  });
  // Rewrite system-role permissions on every run so the matrix stays in sync with the seed definition.
  // System roles are read-only in the UI; user-created roles are untouched.
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  const perms = buildPermissions(level, { adminOnly, globalLevel });
  await prisma.rolePermission.createMany({
    data: perms.map((p) => ({ roleId: role.id, ...p })),
  });
  return role;
}

async function seedRoles() {
  await syncSystemRole(
    "Admin",
    "Full access to all resources and events.",
    "DELETE",
    { adminOnly: true },
  );
  await syncSystemRole(
    "User",
    "Default role: edit access on all events; no access to admin settings, roles, or user management.",
    "WRITE",
    { adminOnly: false },
  );
  // Starting point for outside collaborators — a venue rep, a sponsor, an
  // auditor. Read-only, and only on the events they are explicitly assigned to.
  // GLOBAL is VIEW rather than NONE on purpose: for an event-scoped resource
  // GLOBAL means "may open this section at all", so NONE would leave them
  // unable to reach the events list even for their own events.
  //
  // System roles are rewritten on every seed and read-only in the UI, so this
  // is a template: duplicate it to customize (see /users/roles).
  await syncSystemRole(
    "Viewer",
    "Read-only access to assigned events only. No editing, and no access to unassigned events or admin settings.",
    { GLOBAL: "VIEW", ASSIGNED: "VIEW", UNASSIGNED: "NONE" },
    { adminOnly: false, globalLevel: "VIEW" },
  );
}

// The default tenant is created by the multi_tenant migration (slug "default")
// on upgraded databases; on a fresh database it is created here so the seeded
// admin has somewhere to land.
async function seedDefaultTenant() {
  const count = await prisma.tenant.count();
  if (count > 0) return prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  const tenant = await prisma.tenant.create({ data: { name: "Default", slug: "default" } });
  console.log("Created default tenant:", tenant.name);
  return tenant;
}

async function seedUsers(defaultTenant) {
  const adminRole = await prisma.role.findUnique({ where: { name: "Admin" } });
  if (!adminRole) throw new Error("Admin role missing — seedRoles must run before seedUsers.");

  const userCount = await prisma.user.count();

  if (userCount > 0) {
    // Keep the bootstrap account usable: a platform super admin with an Admin
    // membership in the default tenant, whatever happened since first seed.
    const bootstrap = await prisma.user.findUnique({ where: { email: "admin@example.com" } });
    if (bootstrap) {
      if (!bootstrap.isSuperAdmin) {
        await prisma.user.update({ where: { id: bootstrap.id }, data: { isSuperAdmin: true } });
        console.log("Promoted admin@example.com to super admin.");
      }
      await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: defaultTenant.id, userId: bootstrap.id } },
        update: {},
        create: { tenantId: defaultTenant.id, userId: bootstrap.id, roleId: adminRole.id },
      });
    }
    console.log("Users already exist, skipping user seed.");
    return;
  }

  const hashedPassword = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@example.com",
      name: "Admin",
      password: hashedPassword,
      isSuperAdmin: true,
      memberships: { create: { tenantId: defaultTenant.id, roleId: adminRole.id } },
    },
  });

  console.log("Created admin user:", admin.email);
  console.log("Default password: admin123");
  console.log("\n⚠️  Change this password after first login!");
}

// Options, equipment catalog, and the system vendor are per tenant. Every
// tenant gets the defaults it is missing; admin edits are never overwritten.
async function seedTenantData() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const tenant of tenants) {
    const result = await seedTenantDefaults(prisma, tenant.id);
    console.log(
      `Tenant ${tenant.name}: seeded ${result.options} options, ${result.equipment} equipment` +
        (result.systemVendor ? ", system vendor" : ""),
    );
  }
}

async function backfillVenueVendors() {
  const venues = await prisma.venue.findMany({
    where: { vendor: null },
    select: { id: true, name: true, tenantId: true },
  });

  if (venues.length === 0) {
    console.log("All venues already have linked vendors, skipping backfill.");
    return;
  }

  for (const venue of venues) {
    await prisma.vendor.create({
      data: { tenantId: venue.tenantId, name: venue.name, venueId: venue.id },
    });
  }
  console.log(`Backfilled ${venues.length} venue vendor(s).`);
}

async function main() {
  await seedRoles();
  const defaultTenant = await seedDefaultTenant();
  await seedUsers(defaultTenant);
  await seedTenantData();
  await backfillVenueVendors();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
