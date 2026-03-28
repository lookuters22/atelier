# EVENT-DRIVEN ORCHESTRATION & AI ARCHITECTURE

## 1. THE PHILOSOPHY: NON-LINEAR SWITCHBOARD
This application does not use linear API calls. The frontend NEVER talks directly to the AI, and the AI NEVER sends emails directly. Everything operates through **Events**. This allows us to easily snap in new integrations (Gmail IMAP, WhatsApp, IG DMs) later without rewriting core logic.

## 2. INNGEST EVENT DEFINITIONS
All complex actions are triggered by pushing events to Inngest.

**Incoming Triggers (The Outside World):**
- `comms/email.received` (Payload: raw email data)
- `comms/whatsapp.received` (Payload: raw WA message)

**Action Triggers (The UI Buttons):**
- `ai/draft.generate_requested` (Triggered by "Generate Response" UI button)
- `approval/draft.submitted` (Triggered by "Submit for Approval" UI button)
- `approval/draft.approved` (Triggered when photographer clicks "Approve & Send")

## 3. AGNO AGENT TEAMS (THE BRAIN)
The AI is strictly compartmentalized. We do not use one massive prompt.

* **The Triage Cop (Router):** Reads `comms/email.received`. Queries Supabase for the `wedding_id`. Maps the intent. Triggers the correct specialist workflow.
* **The Persona Agent (Writer):** Replaces the mock `regenerateDraftMock`. Takes the raw factual data, applies the photographer's brand voice, and outputs a string to the `drafts` table.
* **The Logistics Agent:** Handles complex math (travel, timelines, pricing) before passing data to the Persona Agent.

## 4. THE APPROVAL LOOP (HUMAN-IN-THE-LOOP)
1.  **Generate:** User clicks "Generate Response". UI fires `ai/draft.generate_requested`.
2.  **Draft:** Agno creates the response and writes it to the `drafts` table with status `pending_approval`. The UI listens to this table and updates.
3.  **Approve:** User reviews, maybe hits "Make it warmer" (updating the draft), then clicks "Submit". UI fires `approval/draft.approved`.
4.  **Send:** An Inngest function listening for `draft.approved` wakes up and executes the native Gmail/WhatsApp API call, then moves the draft to the `messages` table.