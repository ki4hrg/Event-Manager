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
  { label: "AV", sortOrder: 0 },
  { label: "Tables", isSystem: true, sortOrder: 1, models: ["SETUP_ORDER"] },
  { label: "Chairs", isSystem: true, sortOrder: 2, models: ["SETUP_ORDER"] },
  { label: "Staging", sortOrder: 3 },
  { label: "Signage", sortOrder: 4 },
  { label: "Audio Inputs", isSystem: true, sortOrder: 5, models: ["AV_ORDER"] },
  { label: "Audio Outputs", isSystem: true, sortOrder: 6, models: ["AV_ORDER"] },
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
  // AV
  { name: "Projector", category: "AV", sortOrder: 0 },
  { name: "Screen", category: "AV", sortOrder: 1 },
  { name: "Microphone", category: "AV", sortOrder: 2 },
  { name: "Podium", category: "AV", sortOrder: 3 },
  { name: "Webcast", category: "AV", sortOrder: 4 },
  { name: "Recording", category: "AV", sortOrder: 5 },
  { name: "Video Playback", category: "AV", sortOrder: 6 },
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
  for (const option of options) {
    await prisma.customOption.upsert({
      where: { category_label: { category, label: option.label } },
      update: {},
      create: { category, ...option },
    });
  }
  return 0;
}

async function seedEquipment() {
  for (const item of defaultEquipment) {
    await prisma.equipment.upsert({
      where: { category_name: { category: item.category, name: item.name } },
      update: {},
      create: item,
    });
  }
  return 0;
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
  totalCreated += await seedOptionsForCategory("substatus", defaultSubstatuses);

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
