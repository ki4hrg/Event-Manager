import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const defaultFunctionTypes = [
  { value: "GENERAL", label: "General", color: "gray", sortOrder: 0 },
  { value: "MEAL", label: "Meal / BEO", color: "orange", sortOrder: 1 },
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

async function seedOptions() {
  let totalCreated = 0;

  totalCreated += await seedOptionsForCategory("function_type", defaultFunctionTypes);
  totalCreated += await seedOptionsForCategory("contact_role", defaultContactRoles);
  totalCreated += await seedOptionsForCategory("av_equipment", defaultAVEquipment);
  totalCreated += await seedOptionsForCategory("schedule_type", defaultScheduleTypes);
  totalCreated += await seedOptionsForCategory("presenter_role", defaultPresenterRoles);

  console.log(`Seeded ${totalCreated} total options`);
}

async function main() {
  await seedUsers();
  await seedOptions();
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
