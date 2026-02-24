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

async function seedUsers() {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    console.log("Users already exist, skipping user seed.");
    return;
  }

  const hashedPassword = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@example.com",
      name: "Admin",
      password: hashedPassword,
    },
  });

  console.log("Created admin user:", admin.email);
  console.log("Default password: admin123");
  console.log("\n⚠️  Change this password after first login!");
}

async function seedOptions() {
  const optionCount = await prisma.customOption.count();

  if (optionCount > 0) {
    console.log("Options already exist, skipping options seed.");
    return;
  }

  // Seed function types
  for (const option of defaultFunctionTypes) {
    await prisma.customOption.create({
      data: { category: "function_type", ...option },
    });
  }
  console.log(`Created ${defaultFunctionTypes.length} function types`);

  // Seed contact roles
  for (const option of defaultContactRoles) {
    await prisma.customOption.create({
      data: { category: "contact_role", ...option },
    });
  }
  console.log(`Created ${defaultContactRoles.length} contact roles`);

  // Seed AV equipment
  for (const option of defaultAVEquipment) {
    await prisma.customOption.create({
      data: { category: "av_equipment", ...option },
    });
  }
  console.log(`Created ${defaultAVEquipment.length} AV equipment options`);

  // Seed schedule types
  for (const option of defaultScheduleTypes) {
    await prisma.customOption.create({
      data: { category: "schedule_type", ...option },
    });
  }
  console.log(`Created ${defaultScheduleTypes.length} schedule types`);
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
