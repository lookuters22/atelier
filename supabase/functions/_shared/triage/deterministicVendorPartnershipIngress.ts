/**
 * Conservative deterministic routing for human vendor/pitch and partnership/editorial
 * outreach on `comms/email.received` (after billing/account ingress in triage, before LLM / dedup).
 * Project-type agnostic. {@link evaluateDeterministicBillingAccountIngress} wins when both could apply.
 *
 * Evidence model: client guard (disqualifier) → partnership (strong / publication+feature) →
 * vendor (unambiguous patterns or ≥2 body-evidence phrases). Readable `reason_codes` on match.
 */

import { evaluateDeterministicBillingAccountIngress } from "./deterministicBillingAccountIngress.ts";

export type DeterministicVendorPartnershipSenderRole =
  | "vendor_solicitation"
  | "partnership_or_collaboration";

export type DeterministicVendorPartnershipIngressResult =
  | { match: false }
  | {
      match: true;
      sender_role: DeterministicVendorPartnershipSenderRole;
      reason_codes: string[];
      summary: string;
    };

/**
 * Disqualifiers: real leads across weddings, commercial, video, and content work.
 * Any hit → not vendor/partnership (vendor phrases may appear in footers or quoted text).
 */
const CLIENT_INQUIRY_GUARD_RES: readonly { code: string; re: RegExp }[] = [
  { code: "client_guard_book_hire", re: /\b(we|i)('?d)?\s+(love|like)\s+to\s+(book|hire)\s+you\b/i },
  { code: "client_guard_hire_studio", re: /\bhire\s+your\s+studio\b|\bwork\s+with\s+your\s+studio\b/i },
  {
    code: "client_guard_availability_quote",
    re: /\b(are you available|check your availability|your availability)\b/i,
  },
  {
    code: "client_guard_wedding_event",
    re: /\bour\s+(wedding|elopement|ceremony|reception|big day)\b/i,
  },
  {
    code: "client_guard_for_our_project",
    re: /\bfor\s+our\s+(wedding|event|shoot|ceremony|campaign|launch|brand\s+shoot|commercial\s+shoot|brand\s+video|product\s+launch)\b/i,
  },
  {
    code: "client_guard_photo_video_for_our",
    re: /\bphotograph(er|y)\s+for\s+our\b|\bvideograph(er|y)?\s+for\s+our\b/i,
  },
  {
    code: "client_guard_production_for_our",
    re: /\bvideo\s+(production|shoot)\s+for\s+our\b|\bcontent\s+(for|capture\s+for)\s+our\s+(launch|brand|campaign|event)\b/i,
  },
  {
    code: "client_guard_pricing_package",
    re: /\bwhat(\s+is|\s+'s|')?\s+your\s+(rate|pricing|packages?|day\s+rate|package\s+pricing)\b|\byour\s+(typical|standard)\s+package\b|\bpackage\s+(options?|pricing)\b/i,
  },
  {
    code: "client_guard_quote_estimate",
    re: /\brequest(ing)?\s+(a\s+)?quote\b|\bcould\s+you\s+send\s+(us\s+)?(a\s+)?(quote|estimate)\b|\b(how much|what would it cost|ballpark)\b.*\b(quote|price|rate|cost)\b/i,
  },
  {
    code: "client_guard_collab_hire_studio",
    re: /\b(collaborat(e|ion)|partner(ing)?)\s+with\s+you\s+on\s+our\s+(campaign|launch|brand|video|project|film|content|event|shoot)\b/i,
  },
  {
    code: "client_guard_campaign_launch_inquiry",
    re: /\b(having|want|wanted)\s+your\s+studio\b|\byour\s+studio\s+to\s+(capture|shoot|film)\b|\bexplore\s+.*\b(your\s+studio|working\s+with\s+you)\b/i,
  },
  {
    code: "client_guard_discuss_collaboration_our",
    re: /\bdiscuss\s+(a\s+)?(marketing\s+)?collaboration\s+(on|for)\s+our\s+(campaign|launch|brand|video|project|film|event)\b/i,
  },
  {
    code: "client_guard_marketing_collab_hire",
    re: /\bmarketing\s+collaboration\b.*\b(hire|book)\s+your\s+studio\b/i,
  },
  {
    code: "client_guard_need_studio_to",
    re: /\b(need|looking\s+for)\s+(a\s+)?studio\s+to\b|\bstudio\s+to\s+(lead|handle|execute|capture)\b/i,
  },
  {
    code: "client_guard_interested_booking",
    re: /\binterested\s+in\s+(booking|hiring|working\s+with)\s+you\b/i,
  },
];

/** Partnership: unambiguous outbound pitch phrasing only (not casual “collaboration” / “feature”). */
const PARTNERSHIP_STRONG: readonly { code: string; re: RegExp }[] = [
  {
    code: "partnership_strong_partnership_offer_lang",
    re: /\bpartnership\s+(proposal|opportunity|inquir(y|ies)|offer)\b/i,
  },
  {
    code: "partnership_strong_editorial_desk_lang",
    re: /\beditorial\s+(opportunity|pitch|proposal|submission)\b/i,
  },
  {
    code: "partnership_strong_guest_post_lang",
    re: /\bguest\s+post\s+(pitch|proposal|opportunity)\b/i,
  },
  {
    code: "partnership_strong_sponsored_content_lang",
    re: /\bsponsored\s+content\s+(opportunity|proposal|pitch)\b/i,
  },
  {
    code: "partnership_strong_comarketing_lang",
    re: /\bco-marketing\s+(proposal|opportunity)\b/i,
  },
  {
    code: "partnership_strong_cross_promo_lang",
    re: /\bcross-?promot(e|ion)\s+(proposal|opportunity)\b/i,
  },
];

/** “Feature your …” only with clear publication/media-outlet context (narrower than a single phrase). */
function partnershipFeatureWithPublicationContext(haystack: string): boolean {
  if (!/\bfeature\s+your\s+(work|studio|brand|photography)\b/i.test(haystack)) return false;
  return /\b(our\s+)?(magazine|publication|editorial\s+team|print\s+issue|online\s+magazine|readership|circulation|masthead|column|media\s+brand|(spring|summer|fall|autumn|winter)\s+issue)\b/i.test(
    haystack,
  );
}

/**
 * Vendor: unambiguous pitch categories (SEO/link spam, agency positioning, outsource).
 * Avoid lone generic “growth”, “marketing”, “outreach”, “services” without this shape.
 */
const VENDOR_UNAMBIGUOUS: readonly { code: string; re: RegExp }[] = [
  { code: "vendor_seo_services", re: /\bseo\s+(audit|services|agency|retainer\s+package)\b/i },
  { code: "vendor_link_building", re: /\blink[\s-]+build(ing)?\b/i },
  {
    code: "vendor_backlink_outreach",
    re: /\b(backlink|link\s+insertion)\s+(service|outreach|offer|campaign)\b/i,
  },
  { code: "vendor_digital_marketing_agency", re: /\bdigital\s+marketing\s+agency\b/i },
  { code: "vendor_outreach_agency", re: /\boutreach\s+agency\b/i },
  { code: "vendor_white_label", re: /\bwhite[\s-]label\s+(partner|services|solution)\b/i },
  { code: "vendor_lead_gen_agency", re: /\blead\s+gen(eration)?\s+agency\b/i },
  { code: "vendor_staff_augmentation", re: /\bstaff\s+augmentation\b/i },
  {
    code: "vendor_b2b_sales_agency",
    re: /\bb2b\s+(saas\s+)?(lead|outreach|sales)\s+(agency|services)\b/i,
  },
  {
    code: "vendor_outsource_your_team",
    re: /\boutsource\s+your\s+(development|design|marketing)\b/i,
  },
  {
    code: "vendor_services_for_agencies_studios",
    re: /\bmarketing\s+services\s+for\s+(agencies|studios|brands)\b/i,
  },
  { code: "vendor_guest_posting_service", re: /\bguest\s+posting\s+service\b/i },
];

/** Strong body phrases; need ≥2 distinct hits unless an unambiguous vendor pattern already matched. */
const VENDOR_BODY_EVIDENCE: readonly { code: string; phrase: string }[] = [
  { code: "vendor_body_we_are_digital_agency", phrase: "we are a digital marketing agency" },
  { code: "vendor_body_our_agency_specializes", phrase: "our agency specializes" },
  { code: "vendor_body_full_service_marketing_agency", phrase: "full-service marketing agency" },
  { code: "vendor_body_cold_email_outreach", phrase: "cold email outreach" },
  { code: "vendor_body_link_building_campaign", phrase: "link building campaign" },
  { code: "vendor_body_domain_authority", phrase: "increase your domain authority" },
  { code: "vendor_body_b2b_lead_generation", phrase: "our b2b lead generation" },
];

function normalizeHaystack(subject: string, body: string): string {
  return `${subject}\n${body}`.toLowerCase();
}

/** Shared disqualifier for deterministic non-client ingress (recruiter, etc.). */
export function hitDeterministicClientInquiryGuard(haystack: string): boolean {
  return CLIENT_INQUIRY_GUARD_RES.some((g) => g.re.test(haystack));
}

function collectPartnershipEvidence(haystack: string): string[] {
  const codes = new Set<string>();
  for (const { code, re } of PARTNERSHIP_STRONG) {
    if (re.test(haystack)) codes.add(code);
  }
  if (partnershipFeatureWithPublicationContext(haystack)) {
    codes.add("partnership_editorial_feature_publication_context");
  }
  return [...codes];
}

function firstVendorUnambiguous(haystack: string): { code: string } | null {
  for (const { code, re } of VENDOR_UNAMBIGUOUS) {
    if (re.test(haystack)) return { code };
  }
  return null;
}

function collectVendorBodyEvidence(haystack: string): string[] {
  const codes: string[] = [];
  for (const { code, phrase } of VENDOR_BODY_EVIDENCE) {
    if (haystack.includes(phrase)) codes.push(code);
  }
  return codes;
}

export function evaluateDeterministicVendorPartnershipIngress(input: {
  subject: string;
  body: string;
}): DeterministicVendorPartnershipIngressResult {
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!subject && !body) return { match: false };

  const billing = evaluateDeterministicBillingAccountIngress({ subject, body });
  if (billing.match) return { match: false };

  const haystack = normalizeHaystack(subject, body);
  if (hitDeterministicClientInquiryGuard(haystack)) return { match: false };

  const partnershipCodes = collectPartnershipEvidence(haystack);
  if (partnershipCodes.length > 0) {
    return {
      match: true,
      sender_role: "partnership_or_collaboration",
      reason_codes: partnershipCodes,
      summary:
        "Deterministic partnership/editorial outreach: strong pitch phrasing and/or feature-with-publication context.",
    };
  }

  const unambiguous = firstVendorUnambiguous(haystack);
  const bodyEvidence = collectVendorBodyEvidence(haystack);
  const reason_codes: string[] = [];

  if (unambiguous) {
    reason_codes.push(unambiguous.code);
    return {
      match: true,
      sender_role: "vendor_solicitation",
      reason_codes,
      summary: "Deterministic vendor pitch: unambiguous agency/SEO/outreach pattern.",
    };
  }

  if (bodyEvidence.length >= 2) {
    reason_codes.push("vendor_agency_markers_2", ...[...new Set(bodyEvidence)]);
    return {
      match: true,
      sender_role: "vendor_solicitation",
      reason_codes,
      summary: "Deterministic vendor pitch: multiple independent agency/outreach body markers.",
    };
  }

  return { match: false };
}
