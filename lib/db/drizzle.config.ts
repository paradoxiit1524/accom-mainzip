import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("[drizzle] DATABASE_URL is not set — schema push will be skipped.");
  process.exit(0);
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
