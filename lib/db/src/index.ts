import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[DB] WARNING: DATABASE_URL is not set. Database queries will fail. Set DATABASE_URL in your environment variables.");
}

// Enable SSL for any non-localhost connection (Supabase, Railway postgres, etc.)
function needsSsl(url: string | undefined): boolean {
  if (!url) return false;
  return !url.includes("localhost") && !url.includes("127.0.0.1") && !url.includes("::1");
}

export const pool = new Pool({
  connectionString: connectionString || "postgres://localhost/placeholder",
  ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : false,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false,
});

pool.on("error", (err) => {
  console.error("[DB] Pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
