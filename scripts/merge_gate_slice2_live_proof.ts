/**
 * Merge-gate live proof (Slice 2): uses service_role + PostgREST (no CLI pooler).
 * Run: npx tsx --env-file=.env scripts/merge_gate_slice2_live_proof.ts
 *
 * - Proves match_knowledge returns expected columns with non-empty result when embeddings exist.
 * - If no rows have embeddings: insert is **opt-in** only:
 *   ALLOW_FIXTURE_INSERT=1 and optionally MERGE_GATE_PHOTOGRAPHER_ID=<uuid> (defaults to first photographer).
 * - Optional cleanup: MERGE_GATE_CLEANUP=1 deletes the inserted fixture row by id.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

const ZERO_EMB = new Array(1536).fill(0) as unknown as number[];

async function main() {
  if (!url || !key) {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exitCode = 2;
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const explicitTenant = process.env.MERGE_GATE_PHOTOGRAPHER_ID?.trim();
  let tenantId: string;

  if (explicitTenant) {
    const { data: ph, error: phErr } = await supabase
      .from("photographers")
      .select("id")
      .eq("id", explicitTenant)
      .maybeSingle();
    if (phErr || !ph?.id) {
      console.error("MERGE_GATE_PHOTOGRAPHER_ID not found in photographers:", phErr?.message ?? explicitTenant);
      process.exitCode = 1;
      return;
    }
    tenantId = explicitTenant;
  } else {
    const { data: ph, error: phErr } = await supabase
      .from("photographers")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (phErr || !ph?.id) {
      console.error("photographers probe failed:", phErr?.message ?? "no rows");
      process.exitCode = 1;
      return;
    }
    tenantId = String(ph.id);
  }

  const { count: embedCount, error: cntErr } = await supabase
    .from("knowledge_base")
    .select("*", { count: "exact", head: true })
    .not("embedding", "is", null);

  if (cntErr) {
    console.error("knowledge_base count failed:", cntErr.message);
    process.exitCode = 1;
    return;
  }

  let insertedFixtureId: string | null = null;
  if ((embedCount ?? 0) === 0) {
    if (process.env.ALLOW_FIXTURE_INSERT !== "1") {
      console.error(
        "No knowledge_base rows with embedding. Set ALLOW_FIXTURE_INSERT=1 to insert a minimal staging fixture, or add a real embedded row.",
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      "No knowledge_base rows with embedding — inserting minimal merge_gate fixture (ALLOW_FIXTURE_INSERT=1).",
    );
    const { data: insRow, error: insErr } = await supabase
      .from("knowledge_base")
      .insert({
        photographer_id: tenantId,
        document_type: "brand_voice",
        content: "merge_gate_fixture",
        embedding: ZERO_EMB,
        metadata: { merge_gate_fixture: true },
      })
      .select("id")
      .single();
    if (insErr || !insRow?.id) {
      console.error("Fixture insert failed:", insErr?.message ?? "no id");
      process.exitCode = 1;
      return;
    }
    insertedFixtureId = String(insRow.id);
    console.log("PASS: fixture row inserted id=", insertedFixtureId);
  }

  const { data: kb, error: kbErr } = await supabase
    .from("knowledge_base")
    .select("id, photographer_id, embedding")
    .not("embedding", "is", null)
    .limit(1)
    .maybeSingle();

  if (kbErr || !kb?.embedding) {
    console.error("Expected at least one row with embedding after fixture step.");
    process.exitCode = 1;
    return;
  }

  const embedding = kb.embedding as unknown;
  const pid = String(kb.photographer_id ?? tenantId);

  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: embedding,
    match_threshold: 0.35,
    match_count: 8,
    p_photographer_id: pid,
    p_document_type: null,
  });

  if (error) {
    console.error("match_knowledge RPC failed:", error.message);
    process.exitCode = 1;
    return;
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    console.error(
      "FAIL: match_knowledge returned 0 rows with real embedding + threshold 0.35 (expected self-match).",
    );
    process.exitCode = 1;
    return;
  }

  const r = rows[0];
  const need = ["id", "content", "metadata", "similarity", "document_type", "created_at"];
  const missing = need.filter((k) => !(k in r));
  if (missing.length) {
    console.error("FAIL: missing columns:", missing.join(", "));
    process.exitCode = 1;
    return;
  }

  console.log(
    "PASS: match_knowledge returned",
    rows.length,
    "row(s); columns",
    need.join(", "),
    "present.",
  );
  console.log(
    "NOTE: HNSW index use requires SQL EXPLAIN on the knowledge_base scan (see scripts/merge_gate_slice2_explain.sql).",
  );

  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? "";
  if (anonKey) {
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { count: svcCount } = await supabase
      .from("knowledge_base")
      .select("*", { count: "exact", head: true });
    const { count: anonCount, error: anonErr } = await anon
      .from("knowledge_base")
      .select("*", { count: "exact", head: true });
    if (anonErr) {
      console.log("RLS probe (anon count):", anonErr.message);
    } else {
      const s = svcCount ?? 0;
      const a = anonCount ?? 0;
      if (s > 0 && a > 0) {
        console.error(
          "FAIL: anon key can read knowledge_base rows without auth; RLS may be off or too permissive.",
        );
        process.exitCode = 1;
        return;
      }
      console.log(
        "PASS: knowledge_base anon read count =",
        a,
        "service count =",
        s,
        "(expect anon 0 when unauthenticated).",
      );
    }
  }

  if (process.env.MERGE_GATE_CLEANUP === "1" && insertedFixtureId) {
    const { error: delErr } = await supabase
      .from("knowledge_base")
      .delete()
      .eq("id", insertedFixtureId);
    if (delErr) {
      console.error("Cleanup failed:", delErr.message);
    } else {
      console.log("Cleanup: removed merge_gate fixture row (MERGE_GATE_CLEANUP=1).");
    }
  }
}

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
