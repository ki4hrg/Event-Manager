import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const defaultFunctionTypes = [
  { label: "General", color: "gray", sortOrder: 0 },
  { label: "Meal / Catering Order", color: "orange", sortOrder: 1 },
  { label: "Breakout Session", color: "blue", sortOrder: 2 },
  { label: "Plenary Session", color: "purple", sortOrder: 3 },
];

const defaultContactRoles = [
  { label: "Speaker", sortOrder: 0 },
  { label: "Venue Contact", sortOrder: 1 },
  { label: "Vendor", sortOrder: 2 },
  { label: "Staff", sortOrder: 3 },
  { label: "Other", sortOrder: 4 },
];

const defaultAVEquipment = [
  { label: "Projector", sortOrder: 0 },
  { label: "Screen", sortOrder: 1 },
  { label: "Microphone", sortOrder: 2 },
  { label: "Podium", sortOrder: 3 },
  { label: "Webcast", sortOrder: 4 },
  { label: "Recording", sortOrder: 5 },
  { label: "Video Playback", sortOrder: 6 },
];

const defaultScheduleTypes = [
  { label: "Setup", color: "yellow", sortOrder: 0 },
  { label: "Rehearsal", color: "blue", sortOrder: 1 },
  { label: "Main Event", color: "green", sortOrder: 2 },
  { label: "Breakdown", color: "orange", sortOrder: 3 },
];

const defaultPresenterRoles = [
  { label: "Presenter", sortOrder: 0 },
  { label: "Co-Presenter", sortOrder: 1 },
  { label: "Moderator", sortOrder: 2 },
  { label: "Panelist", sortOrder: 3 },
];

const defaultPresentationTypes = [
  { label: "Breakout", color: "blue", sortOrder: 0 },
  { label: "Plenary", color: "purple", sortOrder: 1 },
];

const defaultEquipmentCategories = [
  { label: "Tables", isSystem: true, sortOrder: 0, models: ["SETUP_ORDER"] },
  { label: "Chairs", isSystem: true, sortOrder: 1, models: ["SETUP_ORDER"] },
  { label: "Staging", sortOrder: 2 },
  { label: "Signage", sortOrder: 3 },
  { label: "Audio Inputs", isSystem: true, sortOrder: 4, models: ["AV_ORDER"] },
  { label: "Audio Outputs", isSystem: true, sortOrder: 5, models: ["AV_ORDER"] },
  { label: "Video Inputs", isSystem: true, sortOrder: 6, models: ["AV_ORDER"] },
  { label: "Video Outputs", isSystem: true, sortOrder: 7, models: ["AV_ORDER"] },
];

const defaultSubstatuses = [
  { label: "Expected", group: "PENDING", sortOrder: 0 },
  { label: "Requested", group: "PENDING", sortOrder: 1 },
  { label: "Approved", group: "IN_PROGRESS", sortOrder: 0 },
  { label: "Confirmed", group: "COMPLETE", sortOrder: 0 },
  { label: "Denied", group: "CANCELLED", sortOrder: 0 },
  { label: "Cancelled", group: "CANCELLED", sortOrder: 1 },
];

const defaultDeliveryMethods = [
  { label: "Pre-loaded", sortOrder: 0 },
  { label: "Brought Day Of", sortOrder: 1 },
];

const defaultMediaTypes = [
  { label: "Video", sortOrder: 0 },
  { label: "Presentation", sortOrder: 1 },
];

const defaultFileTypes = [
  { label: "Proposal", sortOrder: 0 },
  { label: "Invoice", sortOrder: 1 },
  { label: "Contract", sortOrder: 2 },
  { label: "Floor Plan", sortOrder: 3 },
  { label: "Diagram", sortOrder: 4 },
  { label: "Menu", sortOrder: 5 },
  { label: "Spec Sheet", sortOrder: 6 },
  { label: "Other", sortOrder: 7 },
];

const defaultPrintDistributions = [
  { label: "Staged in Room", sortOrder: 0 },
  { label: "On Tables", sortOrder: 1 },
  { label: "At Door / Entrance", sortOrder: 2 },
  { label: "At Registration", sortOrder: 3 },
  { label: "Mailed in Advance", sortOrder: 4 },
];

const defaultSetupTypes = [
  { label: "Fixed in Room", sortOrder: 0 },
  { label: "Theater", sortOrder: 1 },
  { label: "Classroom", sortOrder: 2 },
  { label: "Banquet Rounds", sortOrder: 3 },
  { label: "U-Shape", sortOrder: 4 },
  { label: "Hollow Square", sortOrder: 5 },
  { label: "Reception / Standing", sortOrder: 6 },
];

const defaultEquipment = [
  // Tables
  { name: "6' Rectangle", category: "Tables", sortOrder: 0 },
  { name: "8' Rectangle", category: "Tables", sortOrder: 1 },
  { name: "60\" Round", category: "Tables", sortOrder: 2 },
  { name: "72\" Round", category: "Tables", sortOrder: 3 },
  { name: "Half Round", category: "Tables", sortOrder: 4 },
  { name: "Cocktail / Highboy", category: "Tables", sortOrder: 5 },
  { name: "Head Table", category: "Tables", sortOrder: 6 },
  // Chairs
  { name: "Banquet Chair", category: "Chairs", sortOrder: 0 },
  { name: "Folding Chair", category: "Chairs", sortOrder: 1 },
  { name: "Theater Seat (fixed)", category: "Chairs", sortOrder: 2 },
  // Audio Inputs
  { name: "Handheld Mic", category: "Audio Inputs", sortOrder: 0 },
  { name: "Lapel / Lavalier Mic", category: "Audio Inputs", sortOrder: 1 },
  { name: "Headset Mic", category: "Audio Inputs", sortOrder: 2 },
  { name: "Podium Mic", category: "Audio Inputs", sortOrder: 3 },
  { name: "Direct Input (DI)", category: "Audio Inputs", sortOrder: 4 },
  { name: "Handheld + Belt Pack", category: "Audio Inputs", sortOrder: 5 },
  // Audio Outputs
  { name: "Stage Monitor / Wedge", category: "Audio Outputs", sortOrder: 0 },
  { name: "In-Ear Monitor (IEM)", category: "Audio Outputs", sortOrder: 1 },
  { name: "PA Speaker", category: "Audio Outputs", sortOrder: 2 },
  { name: "Subwoofer", category: "Audio Outputs", sortOrder: 3 },
  { name: "Hearing Loop", category: "Audio Outputs", sortOrder: 4 },
  // Video Inputs
  { name: "Camera", category: "Video Inputs", sortOrder: 0 },
  { name: "PTZ Camera", category: "Video Inputs", sortOrder: 1 },
  { name: "Laptop / Presenter Input", category: "Video Inputs", sortOrder: 2 },
  { name: "Video Switcher", category: "Video Inputs", sortOrder: 3 },
  { name: "Wireless Presentation System", category: "Video Inputs", sortOrder: 4 },
  // Video Outputs
  { name: "Projector", category: "Video Outputs", sortOrder: 0 },
  { name: "LED Screen / Wall", category: "Video Outputs", sortOrder: 1 },
  { name: "Flat Screen / TV", category: "Video Outputs", sortOrder: 2 },
  { name: "Projection Screen", category: "Video Outputs", sortOrder: 3 },
  { name: "Recording Deck / Encoder", category: "Video Outputs", sortOrder: 4 },
];

// Mirrored by src/app/settings/roles/resources.ts PERMISSION_GROUPS. The seed
// runs outside the Next runtime so it can't import the TS module — when a new
// PermissionResource lands in schema.prisma, update both files.
const NON_EVENT_RESOURCES = [
  "ROLES",
  "USERS",
  "SETTINGS",
  "WORKFLOWS",
  "VENDORS",
  "VENUES",
  "CONTACTS",
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
];

// Resources only granted to the Admin role by default. The seeded User role omits these (implicit NONE).
const ADMIN_ONLY_RESOURCES = new Set(["ROLES", "USERS", "SETTINGS", "WORKFLOWS"]);

function buildPermissions(level, { adminOnly }) {
  const perms = [];
  for (const resource of NON_EVENT_RESOURCES) {
    if (!adminOnly && ADMIN_ONLY_RESOURCES.has(resource)) continue;
    perms.push({ resource, scope: "GLOBAL", level });
  }
  for (const resource of EVENT_RESOURCES) {
    for (const scope of ["GLOBAL", "ASSIGNED", "UNASSIGNED"]) {
      perms.push({ resource, scope, level });
    }
  }
  return perms;
}

async function syncSystemRole(name, description, level, { adminOnly }) {
  const role = await prisma.role.upsert({
    where: { name },
    update: { description, isSystem: true },
    create: { name, description, isSystem: true },
  });
  // Rewrite system-role permissions on every run so the matrix stays in sync with the seed definition.
  // System roles are read-only in the UI; user-created roles are untouched.
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  const perms = buildPermissions(level, { adminOnly });
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
}

async function seedUsers() {
  const adminRole = await prisma.role.findUnique({ where: { name: "Admin" } });
  if (!adminRole) throw new Error("Admin role missing — seedRoles must run before seedUsers.");

  const userCount = await prisma.user.count();

  if (userCount > 0) {
    const updated = await prisma.user.updateMany({
      where: { email: "admin@example.com", roleId: { not: adminRole.id } },
      data: { roleId: adminRole.id },
    });
    if (updated.count > 0) {
      console.log("Promoted admin@example.com to Admin role.");
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
      roleId: adminRole.id,
    },
  });

  console.log("Created admin user:", admin.email);
  console.log("Default password: admin123");
  console.log("\n⚠️  Change this password after first login!");
}

async function seedOptionsForCategory(category, options) {
  const existing = await prisma.customOption.count({ where: { category } });
  if (existing > 0) return 0;
  await prisma.customOption.createMany({ data: options.map((o) => ({ category, ...o })) });
  return options.length;
}

async function seedEquipment() {
  const categories = [...new Set(defaultEquipment.map((e) => e.category))];
  for (const category of categories) {
    const existing = await prisma.equipment.count({ where: { category } });
    if (existing > 0) continue;
    await prisma.equipment.createMany({
      data: defaultEquipment.filter((e) => e.category === category),
    });
  }
}

async function seedOptions() {
  let totalCreated = 0;

  totalCreated += await seedOptionsForCategory("function_type", defaultFunctionTypes);
  totalCreated += await seedOptionsForCategory("contact_role", defaultContactRoles);
  totalCreated += await seedOptionsForCategory("av_equipment", defaultAVEquipment);
  totalCreated += await seedOptionsForCategory("schedule_type", defaultScheduleTypes);
  totalCreated += await seedOptionsForCategory("presenter_role", defaultPresenterRoles);
  totalCreated += await seedOptionsForCategory("presentation_type", defaultPresentationTypes);
  totalCreated += await seedOptionsForCategory("equipment_category", defaultEquipmentCategories);
  totalCreated += await seedOptionsForCategory("setup_type", defaultSetupTypes);
  totalCreated += await seedOptionsForCategory("file_type", defaultFileTypes);
  totalCreated += await seedOptionsForCategory("delivery_method", defaultDeliveryMethods);
  totalCreated += await seedOptionsForCategory("media_type", defaultMediaTypes);
  totalCreated += await seedOptionsForCategory("substatus", defaultSubstatuses);
  totalCreated += await seedOptionsForCategory("print_distribution", defaultPrintDistributions);

  console.log(`Seeded ${totalCreated} total options`);
}

async function seedSystemVendors() {
  const existing = await prisma.vendor.findFirst({ where: { isSystemVendor: true } });
  if (existing) {
    console.log("System vendor (Event Team) already exists, skipping.");
    return;
  }
  await prisma.vendor.create({ data: { name: "Event Team", isSystemVendor: true } });
  console.log("Created system vendor: Event Team");
}

async function backfillVenueVendors() {
  const venues = await prisma.venue.findMany({
    where: { vendor: null },
    select: { id: true, name: true },
  });

  if (venues.length === 0) {
    console.log("All venues already have linked vendors, skipping backfill.");
    return;
  }

  for (const venue of venues) {
    await prisma.vendor.create({ data: { name: venue.name, venueId: venue.id } });
  }
  console.log(`Backfilled ${venues.length} venue vendor(s).`);
}

async function main() {
  await seedRoles();
  await seedUsers();
  await seedOptions();
  await seedEquipment();
  await seedSystemVendors();
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
