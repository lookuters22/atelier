import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for real-message / RBAC / proof suites excluded from `vitest.config.ts` and
 * `vitest.context.config.ts` (`test.exclude` there filters even explicit CLI paths).
 *
 * Use this config for `npm run v3:proof-*`, `npm run test:signoff:real-message`, or ad-hoc:
 *   vitest run --config vitest.signoff.config.ts path/to/Proof.test.ts
 *
 * Only `.claude/worktrees` is excluded here so signoff file lists stay runnable.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "npm:@supabase/supabase-js@2": path.resolve(
        "node_modules/@supabase/supabase-js",
      ),
      "npm:zod@4": path.resolve("node_modules/zod"),
      "npm:inngest@3": path.resolve("node_modules/inngest"),
      "npm:sanitize-html@2.13.0": path.resolve("node_modules/sanitize-html"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/.claude/worktrees/**"],
  },
});
