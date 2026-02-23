import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Check if any users exist
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    console.log("Users already exist, skipping seed.");
    return;
  }

  // Create admin user
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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
