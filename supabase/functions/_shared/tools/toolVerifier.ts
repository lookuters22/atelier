import type { AgentResult } from "../../../../src/types/agent.types.ts";
import {
  type VerifierBlockTelemetryAttribution,
} from "../telemetry/telemetryV315Step115a.ts";
import { ToolVerifierInputSchema } from "./schemas.ts";
import { composeToolVerifierAgentResult } from "./toolVerifierCompose.ts";

/**
 * `toolVerifier` — mandatory **pre-generation** gate before execution (execute_v3 Step 6D).
 *
 * **Verifier vs Output Auditor:** This tool evaluates **action allowance, intent, and decision context**
 * before draft/persona generation. It does **not** audit final client-facing prose; post-generation checks
 * (e.g. planner-private leakage) live in output auditors, not here.
 *
 * **Layer 1 — broadcast:** high `broadcastRisk` blocks `auto` (Step 6D.1 escalation shape when required).
 *
 * **Layer 2 — policy gate:** when `policyGate` is present, deterministic rules use audience, playbook
 * metadata, escalation counts, retrieval trace signals, and memory **types/ids only** (no raw body text).
 * Coercions set `facts.verifierStage` / `pipelineHaltsBeforeExternalSend` so autonomous **send/commit**
 * stops while **draft** generation may still proceed when stage is `draft_only`.
 *
 * **Truth hierarchy:** playbook remains primary; memories are supporting signals only.
 */
export async function executeToolVerifier(
  input: unknown,
  photographerId: string,
  telemetry?: VerifierBlockTelemetryAttribution,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const parsed = ToolVerifierInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: parsed.error.message,
      };
    }

    const d = parsed.data;
    return composeToolVerifierAgentResult(
      {
        broadcastRisk: d.broadcastRisk,
        requestedExecutionMode: d.requestedExecutionMode,
        policyGate: d.policyGate,
        escalation: d.escalation as Record<string, unknown> | undefined,
      },
      photographerId,
      telemetry,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      facts: {},
      confidence: 0,
      error: message,
    };
  }
}
