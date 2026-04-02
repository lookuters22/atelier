import { useCallback, useEffect, useState } from "react";

export function useTimedToast(durationMs = 4200) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs, toast]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  return { toast, showToast };
}
