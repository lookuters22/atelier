import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center" style={{ background: "var(--color-background, #0a0a0a)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-[#0169cc]" />
          <span className="dash-loading-text text-[13px] text-ink-muted">Loading</span>
        </div>
      </div>
    );
  }

  if (!user) {
    // return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
