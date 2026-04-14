/** Vitest/node: `supabase/functions` modules use `Deno.env` — set before other imports from that tree. */
if (typeof (globalThis as { Deno?: unknown }).Deno === "undefined") {
  (globalThis as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}
