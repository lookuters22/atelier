import { describe, expect, it } from "vitest";
import {
  computeGmailRepairWorkerOpsWarnings,
  computeGmailRepairWorkerRunHealth,
  gmailRepairLastRunKindFromBatch,
  gmailRepairLastRunOkFromBatch,
} from "./gmailRepairWorkerOps.ts";

describe("gmailRepairWorkerOps (A4 last_run_ok)", () => {
  it("ok when empty queue and no failures", () => {
    expect(
      gmailRepairLastRunOkFromBatch(
        {
          scanned: 0,
          migrated: 0,
          skipped_already_ref: 0,
          skipped_artifact_fk: 0,
          skipped_no_inline: 0,
          failed: 0,
          failure_samples: [],
        },
        null,
      ),
    ).toBe(true);
  });

  it("not ok when RPC failure (scanned 0 + failure_samples)", () => {
    expect(
      gmailRepairLastRunOkFromBatch(
        {
          scanned: 0,
          migrated: 0,
          skipped_already_ref: 0,
          skipped_artifact_fk: 0,
          skipped_no_inline: 0,
          failed: 0,
          failure_samples: ["rpc failed"],
        },
        null,
      ),
    ).toBe(false);
  });

  it("not ok when row failures", () => {
    expect(
      gmailRepairLastRunOkFromBatch(
        {
          scanned: 5,
          migrated: 3,
          skipped_already_ref: 0,
          skipped_artifact_fk: 0,
          skipped_no_inline: 0,
          failed: 2,
          failure_samples: ["a:err", "b:err"],
        },
        null,
      ),
    ).toBe(false);
  });

  it("not ok when explicit last_run_error", () => {
    expect(
      gmailRepairLastRunOkFromBatch(
        {
          scanned: 1,
          migrated: 1,
          skipped_already_ref: 0,
          skipped_artifact_fk: 0,
          skipped_no_inline: 0,
          failed: 0,
          failure_samples: [],
        },
        "manual",
      ),
    ).toBe(false);
  });
});

describe("gmailRepairLastRunKindFromBatch", () => {
  it("rpc_error when scan RPC failed", () => {
    expect(
      gmailRepairLastRunKindFromBatch(
        {
          scanned: 0,
          migrated: 0,
          skipped_already_ref: 0,
          skipped_artifact_fk: 0,
          skipped_no_inline: 0,
          failed: 0,
          failure_samples: ["rpc err"],
        },
        null,
      ),
    ).toBe("rpc_error");
  });

  it("partial_failure when row failures", () => {
    expect(
      gmailRepairLastRunKindFromBatch(
        {
          scanned: 3,
          migrated: 1,
          skipped_already_ref: 0,
          skipped_artifact_fk: 0,
          skipped_no_inline: 0,
          failed: 2,
          failure_samples: ["a:1"],
        },
        null,
      ),
    ).toBe("partial_failure");
  });

  it("success on empty queue", () => {
    expect(
      gmailRepairLastRunKindFromBatch(
        {
          scanned: 0,
          migrated: 0,
          skipped_already_ref: 0,
          skipped_artifact_fk: 0,
          skipped_no_inline: 0,
          failed: 0,
          failure_samples: [],
        },
        null,
      ),
    ).toBe("success");
  });
});

describe("computeGmailRepairWorkerOpsWarnings", () => {
  it("warns when backlog remains and last tick is stale", () => {
    const old = new Date(Date.now() - 80 * 60 * 1000).toISOString();
    const w = computeGmailRepairWorkerOpsWarnings({
      backlog_estimate: 5,
      effective_paused: false,
      last_run_at: old,
      last_run_kind: "success",
      last_run_scanned: 5,
      last_run_migrated: 5,
      last_run_failed: 0,
    });
    expect(w.length).toBeGreaterThan(0);
  });

  it("no stale warning when paused", () => {
    const old = new Date(Date.now() - 80 * 60 * 1000).toISOString();
    const w = computeGmailRepairWorkerOpsWarnings({
      backlog_estimate: 5,
      effective_paused: true,
      last_run_at: old,
      last_run_kind: "skipped_db",
      last_run_scanned: 0,
      last_run_migrated: 0,
      last_run_failed: 0,
    });
    expect(w.length).toBe(0);
  });
});

describe("computeGmailRepairWorkerRunHealth", () => {
  it("paused_expected when effectively paused", () => {
    expect(
      computeGmailRepairWorkerRunHealth({
        backlog_estimate: 10,
        effective_paused: true,
        last_run_at: null,
        last_run_kind: null,
        ops_warnings: [],
        backlog_rpc_error: null,
      }),
    ).toEqual({ ok: true, label: "paused_expected" });
  });

  it("degraded on backlog RPC error", () => {
    expect(
      computeGmailRepairWorkerRunHealth({
        backlog_estimate: null,
        effective_paused: false,
        last_run_at: new Date().toISOString(),
        last_run_kind: "success",
        ops_warnings: [],
        backlog_rpc_error: "permission denied",
      }),
    ).toEqual({ ok: false, label: "degraded" });
  });

  it("healthy on success with no warnings", () => {
    expect(
      computeGmailRepairWorkerRunHealth({
        backlog_estimate: 0,
        effective_paused: false,
        last_run_at: new Date().toISOString(),
        last_run_kind: "success",
        ops_warnings: [],
        backlog_rpc_error: null,
      }),
    ).toEqual({ ok: true, label: "healthy" });
  });
});
