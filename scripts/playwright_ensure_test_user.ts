/**
 * Idempotent: create a Supabase Auth user for Playwright slice3 tests (merge gate).
 * Uses service role; `handle_new_user` trigger inserts `public.photographers`.
 *
 * Fixed credentials (override with env):
 *   PLAYWRIGHT_EMAIL (default: merge-gate-e2e@example.com)
 *   PLAYWRIGHT_PASSWORD (default: MergeGatePlaywright2026!)
 *
 * Run: npx tsx --env-file=.env scripts/playwright_ensure_test_user.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const p = join(__dirname, "..", ".env");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf-8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadDotEnv();

const url = process.env.VITE_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email =
  process.env.PLAYWRIGHT_EMAIL?.trim() || "merge-gate-e2e@example.com";
const password =
  process.env.PLAYWRIGHT_PASSWORD ?? "MergeGatePlaywright2026!";

async function main() {
  if (!url || !key) {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exitCode = 2;
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    if (
      /already registered|already been registered|duplicate/i.test(error.message) ||
      error.status === 422
    ) {
      console.log("OK: user already exists:", email);
      return;
    }
    console.error("createUser failed:", error.message);
    process.exitCode = 1;
    return;
  }

  console.log("OK: created user", email, "user_id=", data.user?.id);
}

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
