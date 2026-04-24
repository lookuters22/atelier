import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest-only config — keeps the dev build lean (vite.config.ts stays minimal).
// React plugin is only required for tests that render components (selectors).
//
// Deno-style `npm:…` specifiers in `supabase/functions` (Edge) must resolve here too, or
// `npx vitest run supabase/.../*.test.ts` fails with "Cannot find package 'npm:zod@4'".
// Keep these aliases in sync with `vitest.context.config.ts`.
// Default discovery skips heavy real-message signoff / proof tests (F5). `test.exclude` applies to
// CLI file filters too — e.g. `vitest run --config vitest.config.ts …/v3StressReplayBatch1Harness.test.ts`
// yields "no test files". For those suites use `vitest.signoff.config.ts`:
//   npm run v3:proof-real-message-stress-signoff
//   npm run test:signoff:real-message
// Non-excluded tests still run when passed explicitly with this config.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "npm:@supabase/supabase-js@2": path.resolve(__dirname, "node_modules/@supabase/supabase-js"),
      "npm:zod@4": path.resolve(__dirname, "node_modules/zod"),
      "npm:inngest@3": path.resolve(__dirname, "node_modules/inngest"),
      "npm:sanitize-html@2.13.0": path.resolve(__dirname, "node_modules/sanitize-html"),
    },
  },
  test: {
    // Default environment stays node (pure TS unit tests in supabase/ and most of src/).
    // Component tests opt in via `// @vitest-environment jsdom` at the top of the file.
    environment: "node",
    globals: false,
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
  },
});
