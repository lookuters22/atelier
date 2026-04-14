import { describe, expect, it } from "vitest";
import { buildEffectiveSenderParticipantsForAuthority } from "./buildEffectiveSenderParticipantsForAuthority.ts";
import type { ThreadParticipantAudienceRow } from "../../../../src/types/decisionContext.types.ts";

function row(over: Partial<ThreadParticipantAudienceRow> & { person_id: string }): ThreadParticipantAudienceRow {
  return {
    id: "tp1",
    thread_id: "t1",
    visibility_role: "",
    is_cc: false,
    is_recipient: true,
    is_sender: false,
    ...over,
  };
}

describe("buildEffectiveSenderParticipantsForAuthority", () => {
  it("promotes existing participant to is_sender when person matches", () => {
    const a = row({ id: "a", person_id: "p1", is_recipient: true });
    const b = row({ id: "b", person_id: "p2", is_recipient: false });
    const out = buildEffectiveSenderParticipantsForAuthority([a, b], "t1", "p2");
    expect(out.find((p) => p.person_id === "p2")?.is_sender).toBe(true);
    expect(out.find((p) => p.person_id === "p1")?.is_sender).toBe(false);
    expect(out).toHaveLength(2);
  });

  it("appends minimal synthetic row when resolved person not on thread", () => {
    const a = row({ person_id: "p1" });
    const out = buildEffectiveSenderParticipantsForAuthority([a], "thr-1", "p9");
    expect(out).toHaveLength(2);
    const syn = out.find((p) => p.person_id === "p9");
    expect(syn?.is_sender).toBe(true);
    expect(syn?.id.startsWith("authority_fallback_sender:")).toBe(true);
    expect(syn?.thread_id).toBe("thr-1");
  });
});
