/**
 * Idempotent staging/local fixture for Playwright slice3 merge gate (real DB rows only).
 * Requires MERGE_GATE_ALLOW_SEED=1 before any destructive cleanup or insert (staging/non-production only).
 * Also requires merge-gate auth user (see scripts/playwright_ensure_test_user.ts) and
 * VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Creates:
 *   - Wedding "Merge Gate Project" (link target)
 *   - Unfiled thread "merge_gate_link_fixture" + plain inbound message (A1 link action)
 *   - Unfiled thread "merge_gate_g3_fixture" + G3 render_html_ref + tiny HTML in Storage (A2 lazy HTML)
 *
 * Run order:
 *   npx tsx scripts/playwright_ensure_test_user.ts
 *   npm run playwright:seed-merge-gate-fixture
 *   npm run test:e2e:slice3
 *
 * Re-run the seed before each full merge-gate run: A1 links the link-fixture thread to the wedding.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURE_WEDDING_NAME = "Merge Gate Project";
const FIXTURE_THREAD_G3 = "merge_gate_g3_fixture";
const FIXTURE_THREAD_LINK = "merge_gate_link_fixture";
const G3_STORAGE_FILENAME = "merge_gate_g3.html";

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

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email =
  process.env.PLAYWRIGHT_EMAIL?.trim() || "merge-gate-e2e@example.com";

const htmlBytes = new TextEncoder().encode(
  "<!doctype html><html><body><p>merge gate g3</p></body></html>",
);

async function findUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  userEmail: string,
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    console.error("listUsers:", error.message);
    return null;
  }
  const u = (data.users ?? []).find((x) => x.email?.toLowerCase() === userEmail.toLowerCase());
  return u?.id ?? null;
}

async function main() {
  if (process.env.MERGE_GATE_ALLOW_SEED !== "1") {
    console.error(
      "Refusing to run: destructive cleanup and insert require MERGE_GATE_ALLOW_SEED=1 (staging/non-production only).",
    );
    process.exitCode = 2;
    return;
  }

  if (!url || !key) {
    console.error("Missing VITE_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exitCode = 2;
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const photographerId = await findUserIdByEmail(supabase, email);
  if (!photographerId) {
    console.error(`No auth user with email ${email}. Run playwright_ensure_test_user.ts first.`);
    process.exitCode = 1;
    return;
  }

  // --- cleanup (idempotent) ---
  const { data: oldThreads } = await supabase
    .from("threads")
    .select("id")
    .eq("photographer_id", photographerId)
    .in("title", [FIXTURE_THREAD_G3, FIXTURE_THREAD_LINK]);

  const oldThreadIds = (oldThreads ?? []).map((r) => r.id as string);

  if (oldThreadIds.length > 0) {
    const { data: oldMessages } = await supabase
      .from("messages")
      .select("id")
      .in("thread_id", oldThreadIds);

    for (const m of oldMessages ?? []) {
      const mid = m.id as string;
      const storagePath = `${photographerId}/${mid}/${G3_STORAGE_FILENAME}`;
      await supabase.storage.from("message_attachment_media").remove([storagePath]);
    }

    await supabase.from("threads").delete().in("id", oldThreadIds);
  }

  await supabase
    .from("weddings")
    .delete()
    .eq("photographer_id", photographerId)
    .eq("couple_names", FIXTURE_WEDDING_NAME);

  const weddingDate = new Date("2026-06-15T12:00:00.000Z").toISOString();

  const { data: wedding, error: wErr } = await supabase
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: FIXTURE_WEDDING_NAME,
      wedding_date: weddingDate,
      location: "Merge gate fixture",
      stage: "inquiry",
    })
    .select("id")
    .single();

  if (wErr || !wedding) {
    console.error("Insert wedding failed:", wErr?.message);
    process.exitCode = 1;
    return;
  }

  const weddingId = wedding.id as string;

  async function insertUnfiledThread(title: string) {
    const { data: th, error: tErr } = await supabase
      .from("threads")
      .insert({
        photographer_id: photographerId,
        wedding_id: null,
        title,
        kind: "group",
        last_activity_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (tErr || !th) throw new Error(tErr?.message ?? "thread insert");
    return th.id as string;
  }

  const linkThreadId = await insertUnfiledThread(FIXTURE_THREAD_LINK);
  const g3ThreadId = await insertUnfiledThread(FIXTURE_THREAD_G3);

  const { error: linkMsgErr } = await supabase.from("messages").insert({
    thread_id: linkThreadId,
    photographer_id: photographerId,
    direction: "in",
    sender: "merge-gate@example.com",
    body: "Plain body for link-thread proof.",
    metadata: {},
  });
  if (linkMsgErr) {
    console.error("Insert link message failed:", linkMsgErr.message);
    process.exitCode = 1;
    return;
  }

  const { data: g3Msg, error: g3MsgIns } = await supabase
    .from("messages")
    .insert({
      thread_id: g3ThreadId,
      photographer_id: photographerId,
      direction: "in",
      sender: "merge-gate-g3@example.com",
      body: "G3 HTML lives in Storage (fixture).",
      metadata: {},
    })
    .select("id")
    .single();

  if (g3MsgIns || !g3Msg) {
    console.error("Insert g3 message failed:", g3MsgIns?.message);
    process.exitCode = 1;
    return;
  }

  const g3MessageId = g3Msg.id as string;
  const storagePath = `${photographerId}/${g3MessageId}/${G3_STORAGE_FILENAME}`;

  const { error: upErr } = await supabase.storage
    .from("message_attachment_media")
    .upload(storagePath, htmlBytes, { contentType: "text/html", upsert: true });
  if (upErr) {
    console.error("Storage upload failed:", upErr.message);
    process.exitCode = 1;
    return;
  }

  const { data: art, error: artErr } = await supabase
    .from("gmail_render_artifacts")
    .insert({
      photographer_id: photographerId,
      message_id: g3MessageId,
      storage_bucket: "message_attachment_media",
      storage_path: storagePath,
      byte_size: htmlBytes.byteLength,
    })
    .select("id")
    .single();

  if (artErr || !art) {
    console.error("Insert gmail_render_artifacts failed:", artErr?.message);
    process.exitCode = 1;
    return;
  }

  const artifactId = art.id as string;

  const renderRef = {
    version: 1,
    artifact_id: artifactId,
    storage_bucket: "message_attachment_media",
    storage_path: storagePath,
    byte_size: htmlBytes.byteLength,
  };

  const { error: metaErr } = await supabase
    .from("messages")
    .update({
      gmail_render_artifact_id: artifactId,
      metadata: {
        gmail_import: {
          render_html_ref: renderRef,
        },
      },
    })
    .eq("id", g3MessageId);

  if (metaErr) {
    console.error("Update g3 message metadata failed:", metaErr.message);
    process.exitCode = 1;
    return;
  }

  console.log("OK merge gate fixture seeded.");
  console.log("  photographer_id:", photographerId);
  console.log("  wedding_id (Merge Gate Project):", weddingId);
  console.log("  thread link:", linkThreadId);
  console.log("  thread g3:  ", g3ThreadId);
}

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
