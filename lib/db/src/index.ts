import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const rawUrl = process.env.DATABASE_URL.trim();
const isSupabase = /supabase\.(co|com)/i.test(rawUrl);

// Prefer explicit ssl object on serverless; drop sslmode from the URI to avoid
// pg treating "require" as verify-full and failing certificate checks.
let connectionString = rawUrl;
if (isSupabase) {
  const u = new URL(rawUrl);
  u.searchParams.delete("sslmode");
  connectionString = u.toString();
}

export const pool = new Pool({
  connectionString,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  // Serverless: keep the pool tiny so cold starts don't open many connections.
  max: isSupabase ? 1 : 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
