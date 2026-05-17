import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prismaLog =
  process.env.PRISMA_LOG_QUERIES === "true"
    ? (["query", "error", "warn"] as const)
    : process.env.PRISMA_LOG_ERRORS === "true"
      ? (["error", "warn"] as const)
      : (["warn"] as const);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...prismaLog],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
