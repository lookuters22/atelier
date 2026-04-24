import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.ts";
import { getSupabaseEdgeFunctionErrorMessage } from "../../lib/supabaseEdgeFunctionErrorMessage.ts";
import { buildSupersedeOperatorAssistantMemoryInvokeBody } from "../../lib/operatorMemorySupersessionInvoke.ts";
import { visibleProjectMemoriesFromFetch } from "../../lib/projectMemoriesDisplay.ts";
import type { Tables } from "../../types/database.types.ts";

type ProjectMemoryRow = Pick<
  Tables<"memories">,
  "id" | "title" | "summary" | "type" | "supersedes_memory_id" | "last_accessed_at" | "audience_source_tier"
>;

function projectMemoryAudienceLabel(tier: string | null): string | null {
  if (tier === "internal_team") return "Internal";
  if (tier === "operator_only") return "Studio-private";
  return null;
}

const SUPERSEDE_CONFIRM =
  "This will mark the older memory as superseded by the newer one. The older memory will be hidden from future Ana retrieval.";

const ANA_READ_CARD_GRADIENT = "linear-gradient(180deg, rgba(255,86,0,0.04), #fff)";

/**
 * Compact Pipeline inspector bubble — matches `p-insp-card pipeline-ana-read-card` (see PipelineInspector).
 */
export function WeddingProjectMemoriesCard({
  weddingId,
  photographerId,
  showToast,
}: {
  weddingId: string;
  photographerId: string;
  showToast: (message: string) => void;
}) {
  const [rawRows, setRawRows] = useState<ProjectMemoryRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [supersedeOlderId, setSupersedeOlderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("memories")
      .select("id, title, summary, type, supersedes_memory_id, last_accessed_at, audience_source_tier")
      .eq("photographer_id", photographerId)
      .eq("wedding_id", weddingId)
      .eq("scope", "project")
      .is("archived_at", null)
      .order("last_accessed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });

    if (error) {
      setLoadError(error.message);
      setRawRows([]);
    } else {
      setRawRows((data ?? []) as ProjectMemoryRow[]);
    }
    setLoading(false);
  }, [photographerId, weddingId]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const visible = visibleProjectMemoriesFromFetch(rawRows);
  const canSupersede = visible.length >= 2;

  async function confirmSupersede(newerId: string) {
    if (!supersedeOlderId || newerId === supersedeOlderId) return;
    if (!window.confirm(SUPERSEDE_CONFIRM)) return;

    setBusy(true);
    const body = buildSupersedeOperatorAssistantMemoryInvokeBody(newerId, supersedeOlderId);
    const { data, error: invokeErr } = await supabase.functions.invoke("supersede-operator-assistant-memory", {
      body,
    });

    if (invokeErr) {
      const msg = await getSupabaseEdgeFunctionErrorMessage(invokeErr, data);
      showToast(`Could not supersede memory: ${msg}`);
      setBusy(false);
      return;
    }

    const ok = data !== null && typeof data === "object" && (data as { ok?: unknown }).ok === true;
    if (!ok) {
      const msg =
        data !== null && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : "Unexpected response";
      showToast(`Could not supersede memory: ${msg}`);
      setBusy(false);
      return;
    }

    setSupersedeOlderId(null);
    showToast("Memory superseded. The older note is hidden from Ana retrieval.");
    await loadMemories();
    setBusy(false);
  }

  return (
    <div className="p-insp-card pipeline-ana-read-card" style={{ background: ANA_READ_CARD_GRADIENT }}>
      <div className="ct">
        <span>Project memories</span>
        {supersedeOlderId ? (
          <button
            type="button"
            className="edit"
            disabled={busy}
            onClick={() => setSupersedeOlderId(null)}
          >
            Cancel
          </button>
        ) : null}
      </div>

      {supersedeOlderId ? (
        <p className="pipeline-project-memories-hint">
          Pick the newer row below, then confirm. Highlighted row is the older one.
        </p>
      ) : null}

      {loading ? (
        <p className="pipeline-project-memories-muted">Loading…</p>
      ) : loadError ? (
        <p className="pipeline-project-memories-err">{loadError}</p>
      ) : visible.length === 0 ? (
        <p className="pipeline-project-memories-empty">No active project memories.</p>
      ) : (
        <ul className="pipeline-project-memories-list">
          {visible.map((m) => {
            const isOlderPick = supersedeOlderId === m.id;
            const showSupersedeStarter = supersedeOlderId === null && canSupersede;
            const showReplacement = supersedeOlderId !== null && !isOlderPick;
            const audienceLbl = projectMemoryAudienceLabel(m.audience_source_tier);

            return (
              <li
                key={m.id}
                className={`pipeline-project-memories-row${isOlderPick ? " pipeline-project-memories-row--older" : ""}`}
              >
                <div className="pipeline-project-memories-row-text">
                  <p className="pipeline-project-memories-title">{m.title}</p>
                  <p className="pipeline-project-memories-summary">{m.summary}</p>
                  <p className="pipeline-project-memories-type">
                    {m.type}
                    {audienceLbl ? (
                      <span className="pipeline-project-memories-audience"> · {audienceLbl}</span>
                    ) : null}
                  </p>
                </div>
                <div className="pipeline-project-memories-actions">
                  {showSupersedeStarter ? (
                    <button
                      type="button"
                      className="pipeline-project-memories-action"
                      disabled={busy}
                      onClick={() => setSupersedeOlderId(m.id)}
                    >
                      Mark replaced
                    </button>
                  ) : null}
                  {isOlderPick ? <span className="pipeline-project-memories-badge">Older</span> : null}
                  {showReplacement ? (
                    <button
                      type="button"
                      className="pipeline-project-memories-action"
                      disabled={busy}
                      onClick={() => void confirmSupersede(m.id)}
                    >
                      Use as replacement
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !loadError && visible.length > 0 && !canSupersede ? (
        <p className="pipeline-project-memories-muted">Add another project memory to supersede an older one.</p>
      ) : null}
    </div>
  );
}
