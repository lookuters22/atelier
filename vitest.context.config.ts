import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for `supabase/functions` + shared lib globs (Deno-style `npm:…` imports).
 * Pins `test.include` for a bounded Node surface. Same `npm:` aliases as `vitest.config.ts` /
 * `vitest.signoff.config.ts`.
 *
 * Heavy real-message signoff / proof files are in `test.exclude` (F5). Excludes apply even when you
 * pass a file path on the CLI — those suites will not run under this config. Use
 * `vitest.signoff.config.ts` (see `npm run v3:proof-*` and `npm run test:signoff:real-message`).
 *
 * `npm run test:context` runs the full include glob minus excludes; it does not run signoff proofs.
 */
export default defineConfig({
  resolve: {
    alias: {
      /** Match Vite `vite.config` — some `src/lib` files use `@/…` imports in Vitest. */
      "@": path.resolve(__dirname, "./src"),
      "npm:@supabase/supabase-js@2": path.resolve(
        "node_modules/@supabase/supabase-js",
      ),
      /** Deno `npm:zod@4` in `supabase/functions/_shared/tools/schemas.ts` */
      "npm:zod@4": path.resolve("node_modules/zod"),
      /** Deno `npm:inngest@3` in `supabase/functions/_shared/inngest.ts` */
      "npm:inngest@3": path.resolve("node_modules/inngest"),
      /** Deno `npm:sanitize-html@2.13.0` in `supabase/functions/_shared/gmail/gmailHtmlSanitize.ts` */
      "npm:sanitize-html@2.13.0": path.resolve("node_modules/sanitize-html"),
    },
  },
  test: {
    include: [
      "supabase/functions/_shared/**/*.test.ts",
      "supabase/functions/inngest/**/*.test.ts",
      "src/lib/**/*.test.ts",
      "src/hooks/**/*.test.ts",
      "src/components/**/*.test.tsx",
    ],
    exclude: [
      "**/.claude/worktrees/**",
      "**/v3StressReplayBatch*Harness.test.ts",
      "**/stressTestPausePropagationProof.test.ts",
      "**/stressTest7RbacAudienceProof.test.ts",
      "**/stressTest5And8RbacAudienceProof.test.ts",
      "**/stressTestAudienceTierDecisionPathProof.test.ts",
      "**/crossIngestParityProof.test.ts",
      "**/ingressSenderEmailNormalize.test.ts",
      "**/strDurableRuntimeProof.test.ts",
      "**/v3RbacAudienceRuntimeE2eProof.test.ts",
      "**/v3RealThreadReplayProof.hosted.test.ts",
      "**/reviewPlaybookRuleCandidateMigrationProof.test.ts",
    ],
    environment: "node",
  },
});
