import { PrismaClient, UserRole } from "@prisma/client";
import { pbkdf2Sync, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: "admin" } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: UserRole.ADMIN, isActive: true },
    });
    return;
  }

  await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: hashPassword("Snow@123"),
      role: UserRole.ADMIN,
      isActive: true,
      tokenVersion: 1,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
