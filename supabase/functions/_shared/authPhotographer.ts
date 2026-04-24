import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

let cachedAuthAnonClient: SupabaseClient | null = null;

function getAuthClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  if (!cachedAuthAnonClient) {
    cachedAuthAnonClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedAuthAnonClient;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function requireBearerToken(req: Request): string {
  const token = extractBearerToken(req);
  if (token == null) {
    throw new Error("Missing or invalid Authorization header");
  }
  return token;
}

/**
 * Resolves the authenticated user id (matches `photographers.id` / tenant) from the request JWT.
 */
export async function requirePhotographerIdFromJwt(req: Request): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  const jwt = requireBearerToken(req);
  const {
    data: { user },
    error,
  } = await getAuthClient().auth.getUser(jwt);
  if (error || !user?.id) {
    throw new Error("Unauthorized");
  }
  return user.id;
}

/**
 * Same as {@link requirePhotographerIdFromJwt} but returns null when there is no
 * Bearer token or the session is invalid (no throw).
 */
export async function getPhotographerIdFromJwtIfPresent(
  req: Request,
): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  const jwt = extractBearerToken(req);
  if (jwt == null) return null;
  const {
    data: { user },
    error,
  } = await getAuthClient().auth.getUser(jwt);
  if (error || !user?.id) return null;
  return user.id;
}
