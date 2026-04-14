-- A4: Durable last-run outcome for Gmail repair workers (success vs pause-skip vs failure).

ALTER TABLE public.gmail_repair_worker_state
  ADD COLUMN IF NOT EXISTS last_run_kind text;

COMMENT ON COLUMN public.gmail_repair_worker_state.last_run_kind IS
  'A4: Outcome of last cron/manual tick: success, skipped_env, skipped_db, partial_failure, rpc_error.';
