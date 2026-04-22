/**
 * Compact, read-only text derived from offer-builder **Puck** `Data` for Ana / operator context.
 * Not a full HTML export; block-level **summaries** only.
 */
import type { Data } from "@measured/puck";

const MAX_DEFAULT = 450;
const MAX_DETAILED = 2_500;

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Heuristic outline: document title, block types, and key visible strings (package names, headings, short text).
 * Safe on partial / legacy shapes.
 */
export function summarizeOfferPuckDataForAssistant(
  data: Data | unknown,
  maxChars: number = MAX_DEFAULT,
): string {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return "(no offer document data)";
  }
  const d = data as Data;
  const root = asRecord(d.root);
  const rootProps = asRecord(root.props);
  const docTitle = typeof rootProps.title === "string" && rootProps.title.trim() ? rootProps.title.trim() : "Investment guide";
  const parts: string[] = [`Document title: “${docTitle}”.`];
  const content = Array.isArray(d.content) ? d.content : [];
  const blockLines: string[] = [];
  const typeCounts: Record<string, number> = {};

  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const it = item as { type?: string; props?: unknown };
    const t = typeof it.type === "string" ? it.type : "Unknown";
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    const p = asRecord(it.props);

    if (t === "CoverImage") {
      const title = typeof p.title === "string" ? p.title.trim() : "";
      const sub = typeof p.subtitle === "string" ? p.subtitle.trim() : "";
      blockLines.push(
        `Cover: ${[title, sub].filter(Boolean).join(" — ") || "(untitled cover)"}`.replace(/\s+/g, " "),
      );
    } else if (t === "SplitBlock") {
      const body = typeof p.body === "string" ? p.body.trim() : "";
      blockLines.push(`Split section${body ? `: ${clip(body, 180)}` : ""}`);
    } else if (t === "GalleryGrid") {
      const cap = typeof p.caption === "string" ? p.caption.trim() : "";
      blockLines.push(`Gallery${cap ? `: ${clip(cap, 100)}` : ""}`);
    } else if (t === "StatementBlock") {
      const body = typeof p.body === "string" ? p.body.trim() : "";
      if (body) blockLines.push(`Statement: ${clip(body, 200)}`);
    } else if (t === "PricingTier") {
      const tier = typeof p.tierName === "string" ? p.tierName.trim() : "";
      const price = typeof p.price === "string" ? p.price.trim() : "";
      const features = Array.isArray(p.features) ? p.features : [];
      const featTexts = features
        .slice(0, 4)
        .map((f) => (f && typeof f === "object" && "text" in f ? String((f as { text?: string }).text ?? "") : ""))
        .filter(Boolean);
      blockLines.push(
        `Package “${tier || "untitled"}”${price ? ` — ${price}` : ""}${
          featTexts.length > 0 ? ` — features: ${featTexts.map((x) => clip(x, 80)).join("; ")}` : ""
        }`,
      );
    } else {
      blockLines.push(`Block type: ${t}`);
    }
  }

  if (Object.keys(typeCounts).length > 0) {
    parts.push(
      `Blocks (${content.length}): ${Object.entries(typeCounts)
        .map(([k, c]) => `${k}×${c}`)
        .join(", ")}.`,
    );
  }
  if (blockLines.length > 0) {
    parts.push("Outline: " + blockLines.join(" | "));
  } else {
    parts.push("Outline: (empty document)");
  }

  return clip(parts.join(" "), maxChars);
}

export function listOfferPuckBlockTypesForAssistant(data: unknown): string[] {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return [];
  const d = data as Data;
  const content = Array.isArray(d.content) ? d.content : [];
  const out: string[] = [];
  for (const item of content) {
    if (item && typeof item === "object" && "type" in item) {
      const t = (item as { type?: string }).type;
      if (typeof t === "string") out.push(t);
    }
  }
  return out;
}

export { MAX_DEFAULT as MAX_OFFER_PUCK_ASSISTANT_SUMMARY_DEFAULT_CHARS, MAX_DETAILED as MAX_OFFER_PUCK_ASSISTANT_SUMMARY_DETAILED_CHARS };
