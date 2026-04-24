import { describe, expect, it } from "vitest";
import {
  fetchAssistantThreadMessageBodies,
  IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
  MAX_MESSAGE_BODY_CHARS_IN_SNAPSHOT,
  MAX_THREAD_MESSAGES_IN_SNAPSHOT,
} from "./fetchAssistantThreadMessageBodies.ts";
import { STRUCTURED_ATTACHMENT_BANNER } from "../memory/attachmentSafetyForModelContext.ts";

function emptyMessageAttachmentsFrom() {
  return {
    select: () => ({
      eq: () => ({
        in: () => Promise.resolve({ data: [] as unknown[], error: null }),
      }),
    }),
  };
}

describe("fetchAssistantThreadMessageBodies", () => {
  const tid = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  it("returns idle shape for invalid UUID", async () => {
    const supabase = { from: () => ({}) } as never;
    const r = await fetchAssistantThreadMessageBodies(supabase, "p1", "not-a-uuid");
    expect(r).toMatchObject({
      ...IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
      selectionNote: "invalid_thread_id",
    });
  });

  it("returns thread_not_found_or_denied when row missing", async () => {
    const supabase = {
      from: (table: string) => {
        if (table !== "threads") return {};
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      },
    } as never;
    const r = await fetchAssistantThreadMessageBodies(supabase, "p1", tid);
    expect(r.didRun).toBe(true);
    expect(r.selectionNote).toBe("thread_not_found_or_denied");
    expect(r.messages).toEqual([]);
  });

  it("loads messages in chronological order with per-body clip flag", async () => {
    const longBody = "x".repeat(MAX_MESSAGE_BODY_CHARS_IN_SNAPSHOT + 40);
    const supabase = {
      from: (table: string) => {
        if (table === "threads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: tid, title: "Thread A", photographer_id: "p1" },
                      error: null,
                    }),
                }),
              }),
            }),
          };
        }
        if (table === "messages") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: "m2",
                            direction: "out",
                            sender: "studio@x.com",
                            body: "Thanks!",
                            sent_at: "2025-01-02T00:00:00.000Z",
                          },
                          {
                            id: "m1",
                            direction: "in",
                            sender: "c@y.com",
                            body: longBody,
                            sent_at: "2025-01-01T00:00:00.000Z",
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "message_attachments") return emptyMessageAttachmentsFrom();
        return {};
      },
    } as never;

    const r = await fetchAssistantThreadMessageBodies(supabase, "p1", tid);
    expect(r.didRun).toBe(true);
    expect(r.selectionNote).toBe("messages_loaded");
    expect(r.threadTitle).toBe("Thread A");
    expect(r.messages).toHaveLength(2);
    expect(r.messages[0]!.messageId).toBe("m1");
    expect(r.messages[0]!.direction).toBe("in");
    expect(r.messages[0]!.bodyClipped).toBe(true);
    expect(r.messages[0]!.bodyExcerpt.length).toBe(MAX_MESSAGE_BODY_CHARS_IN_SNAPSHOT);
    expect(r.messages[1]!.messageId).toBe("m2");
    expect(r.truncatedOverall).toBe(true);
  });

  it("redacts sensitive payment/identity text in body excerpts before clipping", async () => {
    const sensitiveBody = "Wire to DE89370400440532013000 and card 4242424242424242";
    const supabase = {
      from: (table: string) => {
        if (table === "threads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: tid, title: "T", photographer_id: "p1" },
                      error: null,
                    }),
                }),
              }),
            }),
          };
        }
        if (table === "messages") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: "m1",
                            direction: "in",
                            sender: "c@y.com",
                            body: sensitiveBody,
                            sent_at: "2025-01-01T00:00:00.000Z",
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "message_attachments") return emptyMessageAttachmentsFrom();
        return {};
      },
    } as never;

    const r = await fetchAssistantThreadMessageBodies(supabase, "p1", tid);
    const excerpt = r.messages[0]!.bodyExcerpt;
    expect(excerpt).toContain("[redacted: sensitive document or payment identifier]");
    expect(excerpt).not.toMatch(/4242424242424242/);
    expect(excerpt).not.toMatch(/89370400440532013000/);
  });

  it("exports snapshot caps matching product contract", () => {
    expect(MAX_THREAD_MESSAGES_IN_SNAPSHOT).toBe(8);
    expect(MAX_MESSAGE_BODY_CHARS_IN_SNAPSHOT).toBe(900);
  });

  it("P12: surfaces metadata-only attachment inventory on operator thread message excerpts", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "threads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: tid, title: "Invoice thread", photographer_id: "p1" },
                      error: null,
                    }),
                }),
              }),
            }),
          };
        }
        if (table === "messages") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: "m-att",
                            direction: "in",
                            sender: "client@x.com",
                            body: "See screenshot of the bank error.",
                            sent_at: "2025-01-03T00:00:00.000Z",
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "message_attachments") {
          return {
            select: () => ({
              eq: () => ({
                in: () =>
                  Promise.resolve({
                    data: [
                      {
                        message_id: "m-att",
                        mime_type: "image/png",
                        kind: "attachment",
                        metadata: { original_filename: "bofa_transfer_rejected.png" },
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return {};
      },
    } as never;

    const r = await fetchAssistantThreadMessageBodies(supabase, "p1", tid);
    const excerpt = r.messages[0]!.bodyExcerpt;
    expect(excerpt).toContain(STRUCTURED_ATTACHMENT_BANNER);
    expect(excerpt).toContain("Attachment inventory (metadata only");
    expect(excerpt).toContain("image (visual/reference)");
    expect(excerpt).toContain("bank");
  });
});
