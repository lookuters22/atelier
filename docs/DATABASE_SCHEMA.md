# SUPABASE DATABASE SCHEMA (THE DATA CONTRACT)

## CORE RULES
1. **Multi-Tenancy:** EVERY table (except `photographers`) MUST have a `photographer_id` column to enforce Supabase Row Level Security (RLS). 
2. **Standardized Enums:** Do not use string literals for statuses. Use the canonical Enums defined below.
3. **Data Mapping:** The frontend models (e.g., `WeddingEntry`) must be mapped to these snake_case tables in the API utility layer.

## CANONICAL ENUMS
**`project_stage`** (Replaces the messy UI strings):
`inquiry` | `consultation` | `proposal_sent` | `contract_out` | `booked` | `prep` | `final_balance` | `delivered` | `archived`

## CORE TABLES

### 1. `photographers` (The Tenants)
- `id` (UUID, Primary Key)
- `email` (String)
- `settings` (JSONB)

### 2. `weddings` (Maps to frontend `WeddingEntry`)
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key)
- `couple_names` (String) - *Maps to `couple`*
- `wedding_date` (Timestamptz) - *Maps to `when`*
- `location` (String) - *Maps to `where`*
- `stage` (Enum: `project_stage`)
- `package_name` (String) - *Maps to `package`*
- `contract_value` (Decimal) - *Maps to `value`*
- `balance_due` (Decimal) - *Maps to `balance`*
- `story_notes` (Text) - *Maps to `story`*

### 3. `clients` (Maps to frontend `WeddingPersonRow`)
- `id` (UUID, Primary Key)
- `wedding_id` (UUID, Foreign Key)
- `name` (String)
- `role` (String) - *Maps to `subtitle` (e.g., Bride, Planner)*
- `email` (String)

### 4. `threads` (Maps to frontend `WeddingThread`)
- `id` (UUID, Primary Key)
- `wedding_id` (UUID, Foreign Key)
- `title` (String)
- `kind` (String: `group`, `planner_only`, `other`)
- `last_activity_at` (Timestamptz)

### 5. `messages` (Maps to frontend `WeddingThreadMessage` & Internal Notes)
- `id` (UUID, Primary Key)
- `thread_id` (UUID, Foreign Key)
- `direction` (String: `in`, `out`, `internal`) - *'internal' replaces the old UI-only internalBody state*
- `sender` (String)
- `body` (Text)
- `sent_at` (Timestamptz)

### 6. `drafts` (The AI Approval Queue)
- `id` (UUID, Primary Key)
- `thread_id` (UUID, Foreign Key)
- `status` (String: `pending_approval`, `approved`, `rejected`)
- `body` (Text)
- `instruction_history` (JSONB) - *For the AI refinement loop*