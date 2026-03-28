import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { parseWeddingTabParam } from "../lib/weddingDetailUtils";
import type { TabId } from "../lib/weddingDetailTypes";

export function useWeddingTabState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => parseWeddingTabParam(searchParams.get("tab")) ?? "timeline");

  useEffect(() => {
    const nextTab = parseWeddingTabParam(searchParams.get("tab"));
    if (nextTab) setTab(nextTab);
  }, [searchParams]);

  function setTabAndUrl(next: TabId) {
    setTab(next);
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        nextParams.set("tab", next);
        return nextParams;
      },
      { replace: true },
    );
  }

  return { tab, setTabAndUrl };
}
