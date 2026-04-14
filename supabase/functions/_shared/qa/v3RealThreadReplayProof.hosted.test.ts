/**
 * Hosted harness entry: Vitest resolves Deno-style `npm:` imports in `supabase/functions` (see `vitest.context.config.ts`).
 * Plain `npx tsx scripts/v3_real_thread_replay_proof.ts` fails on Node without those aliases.
 *
 * Skips unless `V3_REAL_THREAD_REPLAY_HOSTED=1` (default `npm run test:context` does not hit Supabase).
 *
 * Run: `npm run v3:real-thread-replay-proof`
 */
import "../../../../scripts/loadRootEnv.ts";
import "./denoEnvPolyfill.node.ts";
import { describe, it } from "vitest";

const enabled = process.env.V3_REAL_THREAD_REPLAY_HOSTED === "1";

describe.skipIf(!enabled)("v3 real thread replay proof (hosted)", () => {
  it(
    "runs scripts/v3_real_thread_replay_proof.ts",
    async () => {
      const m = await import("../../../../scripts/v3_real_thread_replay_proof.ts");
      await m.v3RealThreadReplayProofPromise;
    },
    600_000,
  );
});
