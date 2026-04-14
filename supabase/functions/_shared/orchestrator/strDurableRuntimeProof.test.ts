/**
 * V3 STR durable path — live DB + operator-delivery send (same stack as `executeClientOrchestratorV1Core`).
 *
 * Run:
 *   V3_STR_DURABLE_PROOF=1 npm run v3:proof-str-durable
 *
 * Loads `.env` / `supabase/.env` from repo root (same pattern as `scripts/v3_auditor_proof_harness.ts`).
 * Uses `supabase/functions/inngest/.qa_fixtures.json` for `photographerId`, `weddingId`, `threadId`.
 *
 * Optional: `V3_STR_PROOF_RESET=1` — dismiss open STR escalations and clear hold on the fixture thread first.
 *
 * Inngest: `recordStrategicTrustRepairEscalation` calls `inngest.send` after a successful hold. With
 * `INNGEST_EVENT_KEY` set, the test also POSTs to the Inngest Event API (`inn.gs/e/...`) to prove the key is
 * accepted (hosted delivery prerequisite). SDK send errors inside the recorder are still swallowed there;
 * use `npm run v3:probe-inngest-key` for an isolated key check.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ORCHESTRATOR_STR_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
} from "../inngest.ts";
import { isThreadV3OperatorHold } from "../operator/threadV3OperatorHold.ts";
import { recordStrategicTrustRepairEscalation } from "./recordStrategicTrustRepairEscalation.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..", "..");

function parseEnvLines(content: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out.push({ key: k, value: v });
  }
  return out;
}

function loadEnvFromRoot(): void {
  for (const rel of [".env", join("supabase", ".env")]) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    for (const { key: k, value: v } of parseEnvLines(readFileSync(p, "utf8"))) {
      if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
    }
  }
}

loadEnvFromRoot();

const STR_MSG =
  "I'm confused — last week Ana said you were fully booked and couldn't take our date, but today the email says you'd happily make an exception. Which is accurate?";

const STR_REASON = ORCHESTRATOR_STR_ESCALATION_REASON_CODES.contradiction_or_expectation_repair_request;

type Fixtures = { photographerId: string; weddingId: string; threadId: string };

function readFixtures(): Fixtures {
  const p = join(root, "supabase", "functions", "inngest", ".qa_fixtures.json");
  const raw = JSON.parse(readFileSync(p, "utf8")) as Fixtures;
  if (!raw.photographerId || !raw.weddingId || !raw.threadId) {
    throw new Error(".qa_fixtures.json missing photographerId, weddingId, or threadId");
  }
  return raw;
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const proofEnabled = process.env.V3_STR_DURABLE_PROOF === "1";
const canRun = Boolean(proofEnabled && supabaseUrl && serviceRole);

describe.skipIf(!canRun)("V3 STR durable runtime proof (V3_STR_DURABLE_PROOF=1)", () => {
  let supabase: SupabaseClient;
  let fixtures: Fixtures;

  beforeAll(() => {
    fixtures = readFixtures();
    supabase = createClient(supabaseUrl!, serviceRole!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("STR-shaped inbound → escalation + hold + isThreadV3OperatorHold; send path exercised", async () => {
    const { photographerId, weddingId, threadId } = fixtures;

    const { data: threadRow, error: threadErr } = await supabase
      .from("threads")
      .select("id")
      .eq("id", threadId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    expect(threadErr).toBeNull();
    expect(threadRow?.id).toBe(threadId);

    if (process.env.V3_STR_PROOF_RESET === "1") {
      const now = new Date().toISOString();
      await supabase
        .from("escalation_requests")
        .update({
          status: "dismissed",
          resolved_at: now,
          resolution_text: "V3 STR durable proof reset (pre-run).",
        })
        .eq("photographer_id", photographerId)
        .eq("thread_id", threadId)
        .eq("reason_code", STR_REASON)
        .eq("status", "open");

      await supabase
        .from("threads")
        .update({
          v3_operator_automation_hold: false,
          v3_operator_hold_escalation_id: null,
        })
        .eq("id", threadId)
        .eq("photographer_id", photographerId);
    }

    const useRealInngestSend = Boolean(process.env.INNGEST_EVENT_KEY?.trim());
    const sendSpy = vi.spyOn(inngest, "send");
    if (!useRealInngestSend) {
      sendSpy.mockResolvedValue({ ids: [] } as never);
    }

    const result = await recordStrategicTrustRepairEscalation(supabase, {
      photographerId,
      threadId,
      weddingId,
      rawMessage: STR_MSG,
    });

    try {
      if (result.recorded === false && result.reason === "open_str_escalation_exists") {
        throw new Error(
          "Open STR escalation already exists on this thread. Re-run with V3_STR_PROOF_RESET=1 or dismiss the open STR escalation manually.",
        );
      }

      if (result.recorded === false && result.reason === "hold_update_failed") {
        throw new Error(
          "Thread hold update failed (STR escalation may have been auto-dismissed). Apply migrations that add " +
            "`threads.v3_operator_automation_hold` and `threads.v3_operator_hold_escalation_id` to this Supabase project, then re-run.",
        );
      }

      expect(result.recorded).toBe(true);
      if (!result.recorded) return;
      const escalationId = result.escalationId;

      const { data: t2, error: t2e } = await supabase
        .from("threads")
        .select("v3_operator_automation_hold, v3_operator_hold_escalation_id")
        .eq("id", threadId)
        .eq("photographer_id", photographerId)
        .single();

      expect(t2e).toBeNull();
      expect(t2?.v3_operator_automation_hold).toBe(true);
      expect(t2?.v3_operator_hold_escalation_id).toBe(escalationId);

      const hold = await isThreadV3OperatorHold(supabase, photographerId, threadId);
      expect(hold).toBe(true);

      const { data: esc, error: esce } = await supabase
        .from("escalation_requests")
        .select(
          "id, reason_code, action_key, question_body, decision_justification, status, operator_delivery",
        )
        .eq("id", escalationId)
        .eq("photographer_id", photographerId)
        .single();

      expect(esce).toBeNull();
      expect(esc?.reason_code).toBe("STR_CONTRADICTION_REPAIR_V1");
      expect(esc?.action_key).toBe("orchestrator.client.v1.strategic_trust_repair.v1");
      expect(esc?.status).toBe("open");
      expect(esc?.operator_delivery).toBe("urgent_now");
      expect(esc?.question_body).toContain("STR_CONTRADICTION_REPAIR_V1");
      expect(esc?.question_body).toContain(`Escalation ID: ${escalationId}`);
      expect(esc?.question_body).toContain(`Client thread: ${threadId}`);

      const j = esc?.decision_justification as Record<string, unknown> | null;
      expect(j?.risk_class).toBe("strategic_trust_repair");
      expect(typeof j?.why_blocked).toBe("string");
      expect(typeof j?.missing_capability_or_fact).toBe("string");

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0]?.[0]).toMatchObject({
        name: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
        data: {
          photographerId,
          escalationId,
          threadId,
          operatorDelivery: "urgent_now",
        },
      });
      expect(String((sendSpy.mock.calls[0]?.[0] as { data?: { questionBody?: string } })?.data?.questionBody)).toContain(
        escalationId,
      );

      if (useRealInngestSend) {
        const k = process.env.INNGEST_EVENT_KEY?.trim();
        expect(k, "INNGEST_EVENT_KEY must be non-empty when useRealInngestSend").toBeTruthy();
        const probeUrl = `https://inn.gs/e/${encodeURIComponent(k!)}`;
        const probeRes = await fetch(probeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "internal/v3.str_durable_proof.hosted_accept.v1",
            data: {
              schemaVersion: 1,
              escalationId,
              threadId,
              source: "strDurableRuntimeProof.test.ts",
            },
          }),
        });
        const probeText = await probeRes.text();
        expect(
          probeRes.ok,
          `Inngest Event API rejected the key (hosted acceptance). HTTP ${probeRes.status}: ${probeText.slice(0, 500)}`,
        ).toBe(true);
        let probeJson: { ids?: unknown };
        try {
          probeJson = JSON.parse(probeText) as { ids?: unknown };
        } catch {
          throw new Error(`Inngest Event API returned non-JSON: ${probeText.slice(0, 300)}`);
        }
        expect(Array.isArray(probeJson.ids), "Expected Inngest response JSON with ids[]").toBe(true);
      }
    } finally {
      sendSpy.mockRestore();
    }
  });
});
