import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;
const isSupabase = /supabase\.(co|com)/i.test(connectionString);

export const pool = new Pool({
  connectionString,
  // Vercel (and similar) need TLS to Supabase; avoid strict CA failures on serverless.
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
