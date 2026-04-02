import { useNavigate } from "react-router-dom";
import { PHOTOGRAPHERS, countWeddingsForPhotographer } from "../../data/managerPhotographers";
import { useManagerContext } from "../../context/ManagerContext";

export function ManagerPhotographersPage() {
  const navigate = useNavigate();
  const { setSelectedId } = useManagerContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Photographers</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Your leads and associates. Open someone to focus the whole manager shell on their work.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PHOTOGRAPHERS.map((p) => {
          const n = countWeddingsForPhotographer(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setSelectedId(p.id);
                navigate("/manager/weddings");
              }}
              className="flex flex-col rounded-lg border border-border bg-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-link/30"
            >
              <div className={"mx-auto flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold ring-2 " + p.ringClass}>{p.initials}</div>
              <p className="mt-4 text-center text-[16px] font-semibold text-ink">{p.displayName}</p>
              <p className="mt-2 text-center text-[13px] text-ink-muted">
                {n === 1 ? "1 active wedding" : `${n} active weddings`}
              </p>
              <span className="mt-4 text-center text-[12px] font-semibold text-link">View work →</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
