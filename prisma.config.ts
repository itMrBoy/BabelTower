import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const isSchemaOnlyCommand = process.argv.some((arg) => arg === "generate" || arg === "validate");

if (!process.env.DATABASE_URL && isSchemaOnlyCommand) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
