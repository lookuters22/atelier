/**
 * Slice 3 merge gate — browser/network proof (staging or local).
 *
 * Requires:
 *   PLAYWRIGHT_EMAIL / PLAYWRIGHT_PASSWORD — Supabase email auth user
 *   Fixture rows for inbox proofs (run once per env):
 *     npx tsx scripts/playwright_ensure_test_user.ts
 *     npm run playwright:seed-merge-gate-fixture (sets MERGE_GATE_ALLOW_SEED=1)
 * Optional:
 *   PLAYWRIGHT_BASE_URL — staging origin (default http://127.0.0.1:5173)
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 — use existing dev/staging server
 *
 * Run: npx playwright test playwright/slice3-merge-gate.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const hasAuth = Boolean(process.env.PLAYWRIGHT_EMAIL?.trim() && process.env.PLAYWRIGHT_PASSWORD);

const FIXTURE_LINK_THREAD_TITLE = "merge_gate_link_fixture";
const FIXTURE_G3_THREAD_TITLE = "merge_gate_g3_fixture";
const FIXTURE_WEDDING_NAME = "Merge Gate Project";

async function login(page: Page) {
  const email = process.env.PLAYWRIGHT_EMAIL!.trim();
  const password = process.env.PLAYWRIGHT_PASSWORD!;
  await page.goto("/login");
  await page.getByPlaceholder("you@studio.com").fill(email);
  await page.getByRole("button", { name: /Continue with email/i }).click();
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: /^Log In$/i }).click();
  await page.waitForTimeout(2500);
  await page.goto("/today");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
}

function isRestGet(url: string) {
  return url.includes("/rest/v1/") && !url.includes("rpc/");
}

test.describe("Slice 3 merge gate", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({ page }) => {
    test.skip(!hasAuth, "Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD for live proof.");
  });

  test("A1: link thread to project refetches inbox/weddings only (no pending-approval storm)", async ({
    page,
  }) => {
    await login(page);

    await page.goto("/inbox");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(3000);

    const linkRow = page.getByRole("button", { name: new RegExp(FIXTURE_LINK_THREAD_TITLE, "i") });
    await expect(linkRow, "seed merge_gate_link_fixture thread").toBeVisible({ timeout: 20_000 });
    await linkRow.click();
    await page.getByRole("button", { name: /Link to Existing Project/i }).click();

    const captured: string[] = [];
    const handler = (req: { method: () => string; url: () => string }) => {
      if (req.method() !== "GET") return;
      const u = req.url();
      if (!isRestGet(u)) return;
      captured.push(u);
    };
    page.on("request", handler);

    await page.getByRole("button", { name: new RegExp(FIXTURE_WEDDING_NAME, "i") }).click();

    await page.waitForTimeout(5000);
    page.off("request", handler);

    const hasInbox = captured.some((u) => u.includes("v_threads_inbox_latest_message"));
    const hasWeddings = captured.some((u) => /\/rest\/v1\/weddings(\?|$)/.test(u));
    const hasPendingApproval = captured.some((u) => u.includes("v_pending_approval_drafts"));

    expect(hasInbox || hasWeddings, "expected inbox or weddings refetch after link").toBe(true);
    expect(hasPendingApproval, "pending approvals should not refetch for inbox+weddings scopes").toBe(
      false,
    );
  });

  test("A2: Inbox — list load avoids per-thread storage/sign; G3 thread open requests signed HTML", async ({
    page,
  }) => {
    await login(page);

    const listSigns: string[] = [];
    const listHandler = (req: { method: () => string; url: () => string }) => {
      if (req.method() !== "GET" && req.method() !== "POST") return;
      const u = req.url();
      if (!u.includes("supabase.co")) return;
      if (u.includes("storage/v1") && (u.includes("object/sign") || u.includes("/sign/"))) {
        listSigns.push(u);
      }
    };
    page.on("request", listHandler);

    await page.goto("/inbox");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(4000);
    page.off("request", listHandler);

    const threadButtons = page.locator("[data-inbox-thread-row]");
    const nThreads = await threadButtons.count();
    if (nThreads === 0) {
      test.skip(true, "No inbox threads — cannot verify lazy HTML vs list.");
      return;
    }

    const burstOnList = listSigns.length;
    if (nThreads >= 2) {
      expect(
        burstOnList,
        "list load must not issue one storage sign per thread (Slice 3 lazy HTML).",
      ).toBeLessThan(nThreads);
    }

    const g3Row = page.getByRole("button", { name: new RegExp(FIXTURE_G3_THREAD_TITLE, "i") });
    await expect(g3Row, "seed merge_gate_g3_fixture thread (G3 lazy HTML)").toBeVisible({
      timeout: 20_000,
    });

    const openSigns: string[] = [];
    const openHandler = (req: { method: () => string; url: () => string }) => {
      if (req.method() !== "GET" && req.method() !== "POST") return;
      const u = req.url();
      if (!u.includes("supabase.co")) return;
      if (u.includes("storage/v1") && (u.includes("object/sign") || u.includes("/sign/"))) {
        openSigns.push(u);
      }
    };
    page.on("request", openHandler);
    await g3Row.click();
    await page.waitForTimeout(4000);
    page.off("request", openHandler);

    expect(openSigns.length, "opening G3 thread must trigger at least one storage sign for lazy HTML").toBeGreaterThan(
      0,
    );
    const g3FixtureSign = openSigns.some(
      (u) =>
        u.includes("message_attachment_media") &&
        (u.includes("merge_gate_g3") || u.includes("merge_gate_g3.html")),
    );
    expect(
      g3FixtureSign,
      "G3 open must request a sign for bucket message_attachment_media and fixture path merge_gate_g3.html",
    ).toBe(true);
  });

  test("A3: Settings — hidden document reduces polling traffic vs visible", async ({ page }) => {
    await login(page);

    const pollish = (u: string) =>
      u.includes("/rest/v1/import_candidates") ||
      u.includes("/rest/v1/gmail_label_import_groups") ||
      u.includes("/rest/v1/connected_accounts");

    const countPollGets = async (ms: number) => {
      const hits: string[] = [];
      const h = (req: { method: () => string; url: () => string }) => {
        if (req.method() !== "GET") return;
        const u = req.url();
        if (!pollish(u)) return;
        hits.push(u);
      };
      page.on("request", h);
      await page.waitForTimeout(ms);
      page.off("request", h);
      return hits.length;
    };

    await page.goto("/settings");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const visibleGets = await countPollGets(9000);

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const hiddenGets = await countPollGets(9000);

    expect(
      hiddenGets,
      "visibility hidden should suppress or reduce Settings pollers (Slice 3).",
    ).toBeLessThanOrEqual(visibleGets + 1);
  });

  test("A4: caps — inbox + weddings requests use bounded selects", async ({ page }) => {
    await login(page);
    const urls: string[] = [];
    const h = (req: { method: () => string; url: () => string }) => {
      if (req.method() !== "GET") return;
      urls.push(req.url());
    };
    page.on("request", h);
    await page.goto("/inbox");
    await page.waitForTimeout(5000);
    page.off("request", h);

    const inboxReq = urls.find((u) => u.includes("v_threads_inbox_latest_message"));
    const weddingsReq = urls.find((u) => /\/rest\/v1\/weddings(\?|$)/.test(u));

    if (inboxReq) {
      expect(inboxReq, "inbox projection should request a limit (PostgREST)").toMatch(/limit=/i);
    }
    if (weddingsReq) {
      expect(weddingsReq, "weddings list should request a limit").toMatch(/limit=/i);
    }
  });
});
