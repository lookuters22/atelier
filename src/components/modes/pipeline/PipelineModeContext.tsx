import { createContext, useContext, useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface PipelineModeState {
  weddingId: string | null;
  selectWedding: (id: string | null) => void;
}

const Ctx = createContext<PipelineModeState | null>(null);

export function PipelineModeProvider({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [localId, setLocalId] = useState<string | null>(null);

  const weddingId = id ?? localId;

  const selectWedding = (newId: string | null) => {
    setLocalId(newId);
    if (newId) {
      navigate(`/pipeline/${newId}`, { replace: true });
    } else {
      navigate("/pipeline", { replace: true });
    }
  };

  return (
    <Ctx.Provider value={{ weddingId, selectWedding }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePipelineMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipelineMode must be used within PipelineModeProvider");
  return ctx;
}
