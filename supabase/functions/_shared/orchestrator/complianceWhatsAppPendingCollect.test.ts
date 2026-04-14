import { describe, expect, it, vi } from "vitest";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";
import { V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY } from "./complianceAssetMissingCapture.ts";
import {
  clearComplianceWhatsAppPendingCollect,
  extractMissingCollectLibraryKeyFromProposals,
  parseComplianceWhatsAppPendingCollect,
  syncComplianceWhatsAppPendingCollectState,
  V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY,
} from "./complianceWhatsAppPendingCollect.ts";

const baseProposal = (over: Partial<OrchestratorProposalCandidate>): OrchestratorProposalCandidate => ({
  id: "p1",
  action_family: "operator_notification_routing",
  action_key: "noop",
  rationale: "",
  verifier_gating_required: false,
  likely_outcome: "draft",
  blockers_or_missing_facts: [],
  ...over,
});

describe("complianceWhatsAppPendingCollect", () => {
  it("extractMissingCollectLibraryKeyFromProposals returns first missing-collect library key", () => {
    const proposals: OrchestratorProposalCandidate[] = [
      baseProposal({ action_key: "send_message" }),
      baseProposal({
        action_key: V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY,
        compliance_asset_library_key: "public_liability_coi",
      }),
    ];
    expect(extractMissingCollectLibraryKeyFromProposals(proposals)).toBe("public_liability_coi");
  });

  it("extractMissingCollectLibraryKeyFromProposals falls back to compliance_asset_resolution.library_key", () => {
    const proposals: OrchestratorProposalCandidate[] = [
      baseProposal({
        action_key: V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY,
        compliance_asset_resolution: {
          library_key: "venue_security_compliance_packet",
          storage_bucket: "compliance_asset_library",
          object_path: "x/y.pdf",
          found: false,
        },
      }),
    ];
    expect(extractMissingCollectLibraryKeyFromProposals(proposals)).toBe("venue_security_compliance_packet");
  });

  it("parseComplianceWhatsAppPendingCollect reads library_key, set_at, source_thread_id, wedding_id", () => {
    const parsed = parseComplianceWhatsAppPendingCollect({
      [V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY]: {
        library_key: "public_liability_coi",
        set_at: "2026-01-01T00:00:00.000Z",
        source_thread_id: "thread-uuid",
        wedding_id: "wedding-uuid",
      },
    });
    expect(parsed).toEqual({
      library_key: "public_liability_coi",
      set_at: "2026-01-01T00:00:00.000Z",
      source_thread_id: "thread-uuid",
      wedding_id: "wedding-uuid",
    });
  });

  it("syncComplianceWhatsAppPendingCollectState sets JSON with thread and wedding for observability", async () => {
    const updates: unknown[] = [];
    const sb = {
      from: (table: string) => {
        if (table !== "photographers") throw new Error(table);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { settings: {} },
                error: null,
              }),
            }),
          }),
          update: (payload: { settings: unknown }) => {
            updates.push(payload);
            return { eq: () => ({ error: null }) };
          },
        };
      },
    };
    const proposals: OrchestratorProposalCandidate[] = [
      baseProposal({
        action_key: V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY,
        compliance_asset_library_key: "public_liability_coi",
      }),
    ];
    const r = await syncComplianceWhatsAppPendingCollectState(sb as never, "ph-1", {
      weddingId: "w-1",
      threadId: "t-1",
      proposals,
    });
    expect(r.action).toBe("set");
    expect(r.library_key).toBe("public_liability_coi");
    const settings = (updates[0] as { settings: Record<string, unknown> }).settings;
    const pending = settings[V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY] as Record<string, unknown>;
    expect(pending.library_key).toBe("public_liability_coi");
    expect(pending.source_thread_id).toBe("t-1");
    expect(pending.wedding_id).toBe("w-1");
    expect(typeof pending.set_at).toBe("string");
  });

  it("syncComplianceWhatsAppPendingCollectState does not clear existing pending when proposals lack missing-collect", async () => {
    const updates: unknown[] = [];
    const sb = {
      from: (table: string) => {
        if (table !== "photographers") throw new Error(table);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  settings: {
                    [V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY]: {
                      library_key: "public_liability_coi",
                      set_at: "2026-01-01T00:00:00.000Z",
                      source_thread_id: null,
                      wedding_id: null,
                    },
                  },
                },
                error: null,
              }),
            }),
          }),
          update: (payload: { settings: unknown }) => {
            updates.push(payload);
            return { eq: () => ({ error: null }) };
          },
        };
      },
    };
    const r = await syncComplianceWhatsAppPendingCollectState(sb as never, "ph-1", {
      weddingId: "w-1",
      threadId: "t-1",
      proposals: [baseProposal({ action_key: "send_message" })],
    });
    expect(r.action).toBe("noop");
    expect(updates).toHaveLength(0);
  });

  it("syncComplianceWhatsAppPendingCollectState overwrites pending when a new missing-collect key appears", async () => {
    const updates: unknown[] = [];
    const sb = {
      from: (table: string) => {
        if (table !== "photographers") throw new Error(table);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  settings: {
                    [V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY]: {
                      library_key: "public_liability_coi",
                      set_at: "2026-01-01T00:00:00.000Z",
                      source_thread_id: "old-thread",
                      wedding_id: null,
                    },
                  },
                },
                error: null,
              }),
            }),
          }),
          update: (payload: { settings: unknown }) => {
            updates.push(payload);
            return { eq: () => ({ error: null }) };
          },
        };
      },
    };
    const r = await syncComplianceWhatsAppPendingCollectState(sb as never, "ph-1", {
      weddingId: "w-2",
      threadId: "t-2",
      proposals: [
        baseProposal({
          action_key: V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY,
          compliance_asset_library_key: "venue_security_compliance_packet",
        }),
      ],
    });
    expect(r.action).toBe("set");
    expect(r.library_key).toBe("venue_security_compliance_packet");
    const settings = (updates[0] as { settings: Record<string, unknown> }).settings;
    const pending = settings[V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY] as Record<string, unknown>;
    expect(pending.library_key).toBe("venue_security_compliance_packet");
    expect(pending.source_thread_id).toBe("t-2");
    expect(pending.wedding_id).toBe("w-2");
  });

  it("clearComplianceWhatsAppPendingCollect removes pending (ingestion success path)", async () => {
    let lastPayload: { settings: Record<string, unknown> } | null = null;
    const sb = {
      from: (table: string) => {
        if (table !== "photographers") throw new Error(table);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  settings: {
                    [V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY]: {
                      library_key: "public_liability_coi",
                      set_at: "2026-01-01T00:00:00.000Z",
                      source_thread_id: null,
                      wedding_id: null,
                    },
                  },
                },
                error: null,
              }),
            }),
          }),
          update: (payload: { settings: Record<string, unknown> }) => {
            lastPayload = payload;
            return { eq: () => ({ error: null }) };
          },
        };
      },
    };
    await clearComplianceWhatsAppPendingCollect(sb as never, "ph-1");
    expect(lastPayload?.settings[V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY]).toBeUndefined();
  });
});
