export type ProjectStage =
  | "inquiry"
  | "consultation"
  | "proposal_sent"
  | "contract_out"
  | "booked"
  | "prep"
  | "final_balance"
  | "delivered"
  | "archived";

export type MessageDirection = "in" | "out" | "internal";

export type ThreadKind = "group" | "planner_only" | "other";

export type DraftStatus = "pending_approval" | "approved" | "rejected";

export type TaskStatus = "open" | "completed";

export interface Database {
  public: {
    Tables: {
      photographers: {
        Row: {
          id: string;
          email: string;
          settings: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          email: string;
          settings?: Record<string, unknown> | null;
        };
        Update: {
          id?: string;
          email?: string;
          settings?: Record<string, unknown> | null;
        };
        Relationships: [];
      };

      weddings: {
        Row: {
          id: string;
          photographer_id: string;
          couple_names: string;
          wedding_date: string;
          location: string;
          stage: ProjectStage;
          package_name: string | null;
          contract_value: number | null;
          balance_due: number | null;
          story_notes: string | null;
        };
        Insert: {
          id?: string;
          photographer_id: string;
          couple_names: string;
          wedding_date: string;
          location: string;
          stage?: ProjectStage;
          package_name?: string | null;
          contract_value?: number | null;
          balance_due?: number | null;
          story_notes?: string | null;
        };
        Update: {
          id?: string;
          photographer_id?: string;
          couple_names?: string;
          wedding_date?: string;
          location?: string;
          stage?: ProjectStage;
          package_name?: string | null;
          contract_value?: number | null;
          balance_due?: number | null;
          story_notes?: string | null;
        };
        Relationships: [];
      };

      clients: {
        Row: {
          id: string;
          wedding_id: string;
          name: string;
          role: string | null;
          email: string | null;
        };
        Insert: {
          id?: string;
          wedding_id: string;
          name: string;
          role?: string | null;
          email?: string | null;
        };
        Update: {
          id?: string;
          wedding_id?: string;
          name?: string;
          role?: string | null;
          email?: string | null;
        };
        Relationships: [];
      };

      threads: {
        Row: {
          id: string;
          wedding_id: string | null;
          title: string;
          kind: ThreadKind;
          last_activity_at: string;
          ai_routing_metadata: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          wedding_id?: string | null;
          title: string;
          kind?: ThreadKind;
          last_activity_at?: string;
          ai_routing_metadata?: Record<string, unknown> | null;
        };
        Update: {
          id?: string;
          wedding_id?: string | null;
          title?: string;
          kind?: ThreadKind;
          last_activity_at?: string;
          ai_routing_metadata?: Record<string, unknown> | null;
        };
        Relationships: [];
      };

      messages: {
        Row: {
          id: string;
          thread_id: string;
          direction: MessageDirection;
          sender: string;
          body: string;
          sent_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          direction: MessageDirection;
          sender: string;
          body: string;
          sent_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          direction?: MessageDirection;
          sender?: string;
          body?: string;
          sent_at?: string;
        };
        Relationships: [];
      };

      drafts: {
        Row: {
          id: string;
          thread_id: string;
          status: DraftStatus;
          body: string;
          instruction_history: Record<string, unknown>[] | null;
        };
        Insert: {
          id?: string;
          thread_id: string;
          status?: DraftStatus;
          body: string;
          instruction_history?: Record<string, unknown>[] | null;
        };
        Update: {
          id?: string;
          thread_id?: string;
          status?: DraftStatus;
          body?: string;
          instruction_history?: Record<string, unknown>[] | null;
        };
        Relationships: [];
      };

      tasks: {
        Row: {
          id: string;
          photographer_id: string;
          wedding_id: string | null;
          title: string;
          due_date: string;
          status: TaskStatus;
        };
        Insert: {
          id?: string;
          photographer_id: string;
          wedding_id?: string | null;
          title: string;
          due_date: string;
          status?: TaskStatus;
        };
        Update: {
          id?: string;
          photographer_id?: string;
          wedding_id?: string | null;
          title?: string;
          due_date?: string;
          status?: TaskStatus;
        };
        Relationships: [];
      };
    };

    Views: Record<string, never>;

    Functions: Record<string, never>;

    Enums: {
      project_stage: ProjectStage;
      message_direction: MessageDirection;
      thread_kind: ThreadKind;
      draft_status: DraftStatus;
      task_status: TaskStatus;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type InsertDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type UpdateDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
