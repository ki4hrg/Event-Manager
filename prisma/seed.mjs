import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const defaultFunctionTypes = [
  { value: "GENERAL", label: "General", color: "gray", sortOrder: 0 },
  { value: "MEAL", label: "Meal / Catering Order", color: "orange", sortOrder: 1 },
  { value: "BREAKOUT", label: "Breakout Session", color: "blue", sortOrder: 2 },
  { value: "PLENARY", label: "Plenary Session", color: "purple", sortOrder: 3 },
];

const defaultContactRoles = [
  { value: "SPEAKER", label: "Speaker", sortOrder: 0 },
  { value: "VENUE_CONTACT", label: "Venue Contact", sortOrder: 1 },
  { value: "VENDOR", label: "Vendor", sortOrder: 2 },
  { value: "STAFF", label: "Staff", sortOrder: 3 },
  { value: "OTHER", label: "Other", sortOrder: 4 },
];

const defaultAVEquipment = [
  { value: "PROJECTOR", label: "Projector", sortOrder: 0 },
  { value: "SCREEN", label: "Screen", sortOrder: 1 },
  { value: "MICROPHONE", label: "Microphone", sortOrder: 2 },
  { value: "PODIUM", label: "Podium", sortOrder: 3 },
  { value: "WEBCAST", label: "Webcast", sortOrder: 4 },
  { value: "RECORDING", label: "Recording", sortOrder: 5 },
  { value: "VIDEO_PLAYBACK", label: "Video Playback", sortOrder: 6 },
];

const defaultScheduleTypes = [
  { value: "SETUP", label: "Setup", color: "yellow", sortOrder: 0 },
  { value: "REHEARSAL", label: "Rehearsal", color: "blue", sortOrder: 1 },
  { value: "MAIN", label: "Main Event", color: "green", sortOrder: 2 },
  { value: "BREAKDOWN", label: "Breakdown", color: "orange", sortOrder: 3 },
];

const defaultPresenterRoles = [
  { value: "PRESENTER", label: "Presenter", sortOrder: 0 },
  { value: "CO_PRESENTER", label: "Co-Presenter", sortOrder: 1 },
  { value: "MODERATOR", label: "Moderator", sortOrder: 2 },
  { value: "PANELIST", label: "Panelist", sortOrder: 3 },
];

const defaultPresentationTypes = [
  { value: "BREAKOUT", label: "Breakout", color: "blue", sortOrder: 0 },
  { value: "PLENARY", label: "Plenary", color: "purple", sortOrder: 1 },
];

const defaultEquipmentCategories = [
  { value: "AV", label: "AV", sortOrder: 0 },
  { value: "TABLES", label: "Tables", isSystem: true, sortOrder: 1 },
  { value: "CHAIRS", label: "Chairs", isSystem: true, sortOrder: 2 },
  { value: "STAGING", label: "Staging", sortOrder: 3 },
  { value: "SIGNAGE", label: "Signage", sortOrder: 4 },
];

const defaultFileTypes = [
  { value: "PROPOSAL", label: "Proposal", sortOrder: 0 },
  { value: "INVOICE", label: "Invoice", sortOrder: 1 },
  { value: "CONTRACT", label: "Contract", sortOrder: 2 },
  { value: "FLOOR_PLAN", label: "Floor Plan", sortOrder: 3 },
  { value: "DIAGRAM", label: "Diagram", sortOrder: 4 },
  { value: "MENU", label: "Menu", sortOrder: 5 },
  { value: "SPEC_SHEET", label: "Spec Sheet", sortOrder: 6 },
  { value: "OTHER", label: "Other", sortOrder: 7 },
];

const defaultSetupTypes = [
  { value: "FIXED_IN_ROOM", label: "Fixed in Room", sortOrder: 0 },
  { value: "THEATER", label: "Theater", sortOrder: 1 },
  { value: "CLASSROOM", label: "Classroom", sortOrder: 2 },
  { value: "BANQUET_ROUNDS", label: "Banquet Rounds", sortOrder: 3 },
  { value: "U_SHAPE", label: "U-Shape", sortOrder: 4 },
  { value: "HOLLOW_SQUARE", label: "Hollow Square", sortOrder: 5 },
  { value: "RECEPTION_STANDING", label: "Reception / Standing", sortOrder: 6 },
];

const defaultEquipment = [
  // AV
  { name: "Projector", category: "AV", sortOrder: 0 },
  { name: "Screen", category: "AV", sortOrder: 1 },
  { name: "Microphone", category: "AV", sortOrder: 2 },
  { name: "Podium", category: "AV", sortOrder: 3 },
  { name: "Webcast", category: "AV", sortOrder: 4 },
  { name: "Recording", category: "AV", sortOrder: 5 },
  { name: "Video Playback", category: "AV", sortOrder: 6 },
  // Tables
  { name: "6' Rectangle", category: "TABLES", sortOrder: 0 },
  { name: "8' Rectangle", category: "TABLES", sortOrder: 1 },
  { name: "60\" Round", category: "TABLES", sortOrder: 2 },
  { name: "72\" Round", category: "TABLES", sortOrder: 3 },
  { name: "Half Round", category: "TABLES", sortOrder: 4 },
  { name: "Cocktail / Highboy", category: "TABLES", sortOrder: 5 },
  { name: "Head Table", category: "TABLES", sortOrder: 6 },
  // Chairs
  { name: "Banquet Chair", category: "CHAIRS", sortOrder: 0 },
  { name: "Folding Chair", category: "CHAIRS", sortOrder: 1 },
  { name: "Theater Seat (fixed)", category: "CHAIRS", sortOrder: 2 },
];

async function seedUsers() {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    // Ensure admin@example.com has admin role
    const updated = await prisma.user.updateMany({
      where: { email: "admin@example.com", role: { not: "admin" } },
      data: { role: "admin" },
    });
    if (updated.count > 0) {
      console.log("Promoted admin@example.com to admin role.");
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
      role: "admin",
    },
  });

  console.log("Created admin user:", admin.email);
  console.log("Default password: admin123");
  console.log("\n⚠️  Change this password after first login!");
}

async function seedOptionsForCategory(category, options) {
  const existingCount = await prisma.customOption.count({ where: { category } });
  if (existingCount > 0) {
    console.log(`${category} options already exist, skipping.`);
    return 0;
  }

  for (const option of options) {
    await prisma.customOption.create({
      data: { category, ...option },
    });
  }
  return options.length;
}

async function seedEquipment() {
  const existingCount = await prisma.equipment.count();
  if (existingCount > 0) {
    console.log("Equipment already exists, skipping.");
    return 0;
  }

  for (const item of defaultEquipment) {
    await prisma.equipment.create({ data: item });
  }
  console.log(`Seeded ${defaultEquipment.length} equipment items`);
  return defaultEquipment.length;
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
