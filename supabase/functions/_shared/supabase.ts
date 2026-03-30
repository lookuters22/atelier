/**
 * Server-side Supabase client for Edge Functions (service role).
 * Bypasses RLS — use with care and always filter by tenant.
 *
 * Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Supabase secrets.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export const supabaseAdmin = createClient(url, key);
