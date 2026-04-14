/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to `1` or `true` to show Gmail repair ops panel (Settings → Gmail). */
  readonly VITE_GMAIL_REPAIR_OPS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
