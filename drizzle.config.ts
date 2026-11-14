import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Reads DATABASE_URL from the environment so the same config works:
//  - locally (via .env)
//  - on Vercel (DATABASE_URL set as a project environment variable)
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
