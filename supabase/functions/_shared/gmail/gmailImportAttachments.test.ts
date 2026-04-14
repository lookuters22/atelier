import { describe, expect, it, vi } from "vitest";
import { fetchGmailAttachmentBytes } from "./gmailAttachmentFetch.ts";
import {
  buildGmailImportLiveSourceUrl,
  GMAIL_IMPORT_MAX_ATTACHMENT_BYTES,
  importGmailAttachmentsForMessage,
  shouldSkipImportByDeclaredOversizedSize,
} from "./gmailImportAttachments.ts";
import type { GmailAttachmentCandidate } from "./gmailMimeAttachments.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

vi.mock("./gmailAttachmentFetch.ts", () => ({
  fetchGmailAttachmentBytes: vi.fn(() => Promise.resolve(new Uint8Array(10))),
}));

describe("shouldSkipImportByDeclaredOversizedSize", () => {
  const base = (): GmailAttachmentCandidate => ({
    filename: "x.bin",
    mimeType: "application/octet-stream",
    attachmentId: "aid",
    partId: "0.1",
    sizeBytes: 100,
    contentId: null,
    disposition: "attachment",
  });

  it("is true when declared size exceeds import max", () => {
    expect(
      shouldSkipImportByDeclaredOversizedSize({
        ...base(),
        sizeBytes: GMAIL_IMPORT_MAX_ATTACHMENT_BYTES + 1,
      }),
    ).toBe(true);
  });

  it("is false when size is unknown or non-positive", () => {
    expect(shouldSkipImportByDeclaredOversizedSize({ ...base(), sizeBytes: 0 })).toBe(false);
    expect(shouldSkipImportByDeclaredOversizedSize({ ...base(), sizeBytes: -1 })).toBe(false);
    expect(shouldSkipImportByDeclaredOversizedSize({ ...base(), sizeBytes: Number.NaN })).toBe(false);
  });

  it("is false at exactly the max (post-fetch check still applies if metadata lies)", () => {
    expect(
      shouldSkipImportByDeclaredOversizedSize({
        ...base(),
        sizeBytes: GMAIL_IMPORT_MAX_ATTACHMENT_BYTES,
      }),
    ).toBe(false);
  });
});

describe("buildGmailImportLiveSourceUrl", () => {
  it("uses attachment id when present", () => {
    const c: GmailAttachmentCandidate = {
      filename: "a.pdf",
      mimeType: "application/pdf",
      attachmentId: "ANGjdJ",
      partId: "0.1",
      sizeBytes: 100,
    };
    expect(buildGmailImportLiveSourceUrl("msg123", c)).toBe("gmail-import:msg123:ANGjdJ");
  });

  it("uses part-based key for inline parts without attachment id", () => {
    const c: GmailAttachmentCandidate = {
      filename: "logo.png",
      mimeType: "image/png",
      partId: "0.2",
      sizeBytes: 2048,
    };
    expect(buildGmailImportLiveSourceUrl("msg123", c)).toBe("gmail-import:msg123:part:0.2");
  });
});

describe("importGmailAttachmentsForMessage", () => {
  it("skips fetch/upload when source_url already exists for message", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const inlineCandidate: GmailAttachmentCandidate = {
      filename: "tiny.png",
      mimeType: "image/png",
      attachmentId: null,
      partId: "0.99",
      sizeBytes: 5,
      contentId: null,
      disposition: "attachment",
      inlineDataBase64Url: "SGVsbG8",
    };
    const existingUrl = buildGmailImportLiveSourceUrl("gm1", inlineCandidate);

    const supabase = {
      from: (table: string) => {
        expect(table).toBe("message_attachments");
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [{ source_url: existingUrl }],
                error: null,
              }),
            }),
          }),
          insert,
        };
      },
      storage: {
        from: () => ({
          upload,
          remove: async () => ({ error: null }),
        }),
      },
    } as unknown as SupabaseClient;

    const candidates: GmailAttachmentCandidate[] = [inlineCandidate];

    const r = await importGmailAttachmentsForMessage(supabase, {
      accessToken: "tok",
      gmailMessageId: "gm1",
      photographerId: "ph1",
      messageId: "m1",
      candidates,
    });

    expect(r.imported).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.skipped_oversized).toBe(0);
    expect(r.skipped_oversized_prefetch).toBe(0);
    expect(r.skipped_already_present).toBe(1);
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("imports when no existing row and counts insert success", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [],
              error: null,
            }),
          }),
        }),
        insert,
      }),
      storage: {
        from: () => ({
          upload,
          remove: async () => ({ error: null }),
        }),
      },
    } as unknown as SupabaseClient;

    const candidates: GmailAttachmentCandidate[] = [
      {
        filename: "new.png",
        mimeType: "image/png",
        attachmentId: null,
        partId: "1.01",
        sizeBytes: 5,
        contentId: null,
        disposition: "attachment",
        inlineDataBase64Url: "SGVsbG8",
      },
    ];

    const r = await importGmailAttachmentsForMessage(supabase, {
      accessToken: "tok",
      gmailMessageId: "gm1",
      photographerId: "ph1",
      messageId: "m1",
      candidates,
    });

    expect(r.imported).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.skipped_already_present).toBe(0);
    expect(r.skipped_oversized_prefetch).toBe(0);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("treats unique violation on insert as idempotent skip", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({
      error: { code: "23505", message: "duplicate key value" },
    });
    const remove = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [],
              error: null,
            }),
          }),
        }),
        insert,
      }),
      storage: {
        from: () => ({
          upload,
          remove,
        }),
      },
    } as unknown as SupabaseClient;

    const candidates: GmailAttachmentCandidate[] = [
      {
        filename: "race.png",
        mimeType: "image/png",
        attachmentId: null,
        partId: "2.02",
        sizeBytes: 5,
        contentId: null,
        disposition: "attachment",
        inlineDataBase64Url: "SGVsbG8",
      },
    ];

    const r = await importGmailAttachmentsForMessage(supabase, {
      accessToken: "tok",
      gmailMessageId: "gm1",
      photographerId: "ph1",
      messageId: "m1",
      candidates,
    });

    expect(r.imported).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.skipped_already_present).toBe(1);
    expect(r.skipped_oversized_prefetch).toBe(0);
    expect(remove).toHaveBeenCalled();
  });

  it("skips Gmail attachments.get when declared size exceeds max", async () => {
    vi.mocked(fetchGmailAttachmentBytes).mockClear();

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        }),
        insert: vi.fn(),
      }),
      storage: {
        from: () => ({
          upload: vi.fn(),
          remove: vi.fn(),
        }),
      },
    } as unknown as SupabaseClient;

    const candidates: GmailAttachmentCandidate[] = [
      {
        filename: "huge.zip",
        mimeType: "application/zip",
        attachmentId: "ANG-large",
        partId: "0.3",
        sizeBytes: GMAIL_IMPORT_MAX_ATTACHMENT_BYTES + 1024,
        contentId: null,
        disposition: "attachment",
      },
    ];

    const r = await importGmailAttachmentsForMessage(supabase, {
      accessToken: "tok",
      gmailMessageId: "gm1",
      photographerId: "ph1",
      messageId: "m1",
      candidates,
    });

    expect(r.skipped_oversized).toBe(1);
    expect(r.skipped_oversized_prefetch).toBe(1);
    expect(r.imported).toBe(0);
    expect(r.failed).toBe(0);
    expect(fetchGmailAttachmentBytes).not.toHaveBeenCalled();
  });
});
