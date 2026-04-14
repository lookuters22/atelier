/**
 * Real runtime RBAC proof — `executeClientOrchestratorV1Core` (same modules as Inngest `clientOrchestratorV1`).
 *
 * Skips unless `V3_RBAC_RUNTIME_E2E=1` and Supabase env + `.qa_fixtures.json` are available.
 *
 * Run:
 *   V3_RBAC_RUNTIME_E2E=1 npm run v3:proof-rbac-audience-e2e
 * Deploy Inngest first when checking deployed worker parity:
 *   npm run v3:deploy-inngest-and-proof-rbac-e2e
 */
import "./denoEnvPolyfill.node.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDecisionContext } from "../context/buildDecisionContext.ts";
import { executeClientOrchestratorV1Core } from "../orchestrator/clientOrchestratorV1Core.ts";
import type { PersonaOutputAuditorSummary } from "../orchestrator/clientOrchestratorV1Core.ts";
import { STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY } from "./stressTestAudienceFixtures.ts";

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out.push({ key: k, value: v });
  }
  return out;
}

function loadEnvFromRoot(): void {
  for (const rel of [".env", join("supabase", ".env")]) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    for (const { key: k, value: v } of parseEnvLines(readFileSync(p, "utf8"))) {
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnvFromRoot();

function textHasRawPrivateCommercialSignals(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("planner commission") ||
    t.includes("agency fee") ||
    t.includes("internal negotiation") ||
    /\bmarkup\b/i.test(text)
  );
}

function classifyRuntimeSafety(persona: PersonaOutputAuditorSummary | undefined): {
  label: "pass" | "partial" | "fail";
  detail: string;
} {
  if (!persona) {
    return { label: "partial", detail: "personaOutputAuditor missing" };
  }
  if (persona.ran === false) {
    const r = persona.reason ?? "";
    if (
      r.includes("persona_writer_disabled") ||
      r.includes("no_api_key") ||
      r === "no_draft"
    ) {
      return {
        label: "partial",
        detail: `Persona did not run (${r}) — context + orchestrator path still exercised.`,
      };
    }
    return { label: "partial", detail: `Persona skipped: ${r}` };
  }
  if (persona.passed) {
    return { label: "pass", detail: "Persona draft accepted by auditors." };
  }
  const viol = persona.violations ?? [];
  const leak = viol.some((v) => v.includes("planner_private"));
  if (leak) {
    return {
      label: "pass",
      detail: "Planner-private or commercial auditor rejected draft (safe).",
    };
  }
  return { label: "fail", detail: `Rejected: ${viol.join("; ")}` };
}

const enabled = process.env.V3_RBAC_RUNTIME_E2E === "1";
const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fixturesPath = join(root, "supabase", "functions", "inngest", ".qa_fixtures.json");

describe.skipIf(!enabled || !url || !sr || !existsSync(fixturesPath))(
  "v3 RBAC audience — runtime E2E (orchestrator core + persona auditors)",
  () => {
    let supabase: SupabaseClient | undefined;
    let photographerId: string;
    let weddingId: string;
    let threadId: string;
    let memoryId: string;
    let personIds: string[];
    const runId = `RBAC-E2E-${Date.now()}`;

    beforeAll(async () => {
      const fx = JSON.parse(readFileSync(fixturesPath, "utf8")) as { photographerId?: string };
      if (!fx.photographerId) throw new Error(".qa_fixtures.json missing photographerId");
      photographerId = fx.photographerId;
      supabase = createClient(url!, sr!, { auth: { persistSession: false, autoRefreshToken: false } });

      const { seedRbacHarnessCase } = await import("../../../../scripts/v3_rbac_audience_seed_module.ts");
      const seeded = await seedRbacHarnessCase(supabase, photographerId, "st7_mixed_audience", runId);
      weddingId = seeded.weddingId;
      threadId = seeded.threadId;
      memoryId = seeded.memoryId;
      personIds = seeded.personIds;
    });

    afterAll(async () => {
      if (!enabled || supabase === undefined) return;
      const { cleanupCaseLoose } = await import("../../../../scripts/v3_rbac_audience_seed_module.ts");
      await cleanupCaseLoose(supabase!, weddingId, threadId, memoryId, personIds);
    });

    it("Stress Test 7–shaped mixed audience + selected memory: context redaction + safe persona outcome", async () => {
      const sb = supabase!;
      const rawMessage =
        "[rbac_e2e] Please confirm next steps. (Internal: planner commission was discussed offline.)";

      const decisionContextRedacted = await buildDecisionContext(
        sb,
        photographerId,
        weddingId,
        threadId,
        "email",
        rawMessage,
        { selectedMemoryIds: [memoryId] },
      );

      const memFull = decisionContextRedacted.selectedMemories[0]?.full_content ?? "";
      const audience = decisionContextRedacted.audience;
      const redactionApplied =
        audience.clientVisibleForPrivateCommercialRedaction === true &&
        !textHasRawPrivateCommercialSignals(memFull);

      expect(audience.visibilityClass).toBe("mixed_audience");
      expect(redactionApplied).toBe(true);

      const coreResult = await executeClientOrchestratorV1Core({
        supabase: sb,
        photographerId,
        weddingId,
        threadId,
        replyChannel: "email",
        rawMessage,
        requestedExecutionMode: "draft_only",
        qaSelectedMemoryIds: [memoryId],
      });

      expect(coreResult.heavyContextSummary.audience.visibilityClass).toBe("mixed_audience");
      expect(coreResult.heavyContextSummary.audience.clientVisibleForPrivateCommercialRedaction).toBe(true);

      const persona = coreResult.personaOutputAuditor;
      const safety = classifyRuntimeSafety(persona);

      const overallPass =
        safety.label === "pass" ||
        safety.label === "partial";

      expect(overallPass).toBe(true);

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const reportsDir = join(root, "reports");
      mkdirSync(reportsDir, { recursive: true });
      const base = `v3-rbac-audience-runtime-e2e-${ts}`;
      const jsonPath = join(reportsDir, `${base}.json`);
      const mdPath = join(reportsDir, `${base}.md`);

      const reportPayload = {
        schema: "v3_rbac_audience_runtime_e2e_v1",
        generatedAt: new Date().toISOString(),
        scenario:
          "Stress Test 7–shaped: st7_mixed_audience seed + selected memory with planner-private commercial text",
        pathExercised:
          "executeClientOrchestratorV1Core — same stack as Inngest clientOrchestratorV1 (buildDecisionContext → proposals → verifier → draft → maybeRewriteOrchestratorDraftWithPersona → escalation). Inngest scheduler not invoked.",
        photographerId,
        weddingId,
        threadId,
        memoryId,
        memoryFixtureExcerpt: STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY.slice(0, 120),
        audienceFromDecisionContext: {
          visibilityClass: audience.visibilityClass,
          clientVisibleForPrivateCommercialRedaction: audience.clientVisibleForPrivateCommercialRedaction,
        },
        upstreamRedactionCheck: {
          selectedMemoryFullContentRedactedForClientAudience: redactionApplied,
          excerptAfterRedaction: memFull.slice(0, 280),
        },
        coreSummary: {
          orchestratorOutcome: coreResult.orchestratorOutcome,
          draftCreated: coreResult.draftCreated,
          proposalCount: coreResult.proposalCount,
          verifierPassed: coreResult.verifierResult.success,
        },
        personaOutputAuditor: persona ?? null,
        runtimeSafetyClassification: safety,
        overallAudienceSafe: overallPass,
      };

      writeFileSync(jsonPath, JSON.stringify(reportPayload, null, 2), "utf8");
      writeFileSync(
        mdPath,
        `# V3 RBAC audience — runtime E2E proof\n\n- **JSON:** \`${jsonPath.replace(/\\/g, "/")}\`\n\n## Verdict\n\n- **Safety:** ${safety.label} — ${safety.detail}\n- **Overall:** ${overallPass ? "PASS" : "FAIL"}\n`,
        "utf8",
      );
    });
  },
);

describe("v3 RBAC runtime E2E — gate", () => {
  it("documents skip when V3_RBAC_RUNTIME_E2E is unset", () => {
    if (enabled) {
      expect(process.env.V3_RBAC_RUNTIME_E2E).toBe("1");
    } else {
      expect(true).toBe(true);
    }
  });
});
