import type { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";

/**
 * Protects /api routes (except health) with a Supabase Auth Bearer JWT.
 * When SUPABASE_URL / SUPABASE_ANON_KEY are unset, auth is skipped so local
 * work against a plain Postgres can continue without Supabase Auth.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (process.env.NODE_ENV === "production") {
      res.status(500).json({ error: "Auth is not configured" });
      return;
    }
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as typeof req & { user?: { id: string; email?: string | null } }).user = {
      id: data.user.id,
      email: data.user.email,
    };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};
