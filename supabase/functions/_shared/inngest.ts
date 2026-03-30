/**
 * Inngest client + event dictionary (Atelier OS).
 * Event names match docs/ARCHITECTURE.md Section 2.
 *
 * Set INNGEST_EVENT_KEY (and signing key for the serve endpoint) in Supabase secrets.
 */
import { EventSchemas, Inngest } from "npm:inngest@3";

export type AtelierEvents = {
  "comms/email.received": {
    data: {
      raw_email: Record<string, unknown>;
    };
  };
  "comms/whatsapp.received": {
    data: {
      raw_message: unknown;
      photographer_id?: string;
    };
  };
  "comms/web.received": {
    data: {
      raw_message: unknown;
      photographer_id?: string;
    };
  };
  "ai/draft.generate_requested": {
    data: {
      wedding_id: string;
    };
  };
  "approval/draft.submitted": {
    data: {
      draft_id: string;
    };
  };
  "approval/draft.approved": {
    data: {
      draft_id: string;
      photographer_id: string;
    };
  };
  "ai/draft.rewrite_requested": {
    data: {
      draft_id: string;
      feedback: string;
    };
  };

  "ai/intent.intake": {
    data: {
      photographer_id: string;
      wedding_id?: string;
      thread_id?: string;
      raw_message: string;
      sender_email: string;
      reply_channel?: string;
    };
  };
  "ai/intent.commercial": {
    data: { wedding_id: string; raw_message: string; reply_channel?: string };
  };
  "ai/intent.logistics": {
    data: { wedding_id: string; raw_message: string; reply_channel?: string };
  };
  "ai/intent.project_management": {
    data: { wedding_id: string; raw_message: string; reply_channel?: string };
  };
  "ai/intent.concierge": {
    data: { wedding_id: string; raw_message: string; reply_channel?: string };
  };
  "ai/intent.studio": {
    data: { wedding_id: string; raw_message: string; reply_channel?: string };
  };
  "ai/intent.persona": {
    data: {
      wedding_id: string;
      thread_id: string;
      photographer_id: string;
      raw_facts: string;
      reply_channel?: string;
    };
  };
  "ai/intent.internal_concierge": {
    data: {
      photographer_id: string;
      from_number: string;
      raw_message: string;
    };
  };
};

export const inngest = new Inngest({
  id: "atelier-os",
  schemas: new EventSchemas().fromRecord<AtelierEvents>(),
});
