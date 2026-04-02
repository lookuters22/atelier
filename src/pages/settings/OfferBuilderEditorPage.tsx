import { Navigate, useParams } from "react-router-dom";
import { getOfferProject } from "../../lib/offerProjectsStorage";
import { OfferBuilderShellProvider } from "./offerBuilderShellContext";
import { OfferBuilderUnifiedBar } from "./OfferBuilderUnifiedBar";
import { OfferPuckEditor } from "./OfferPuckEditor";

export function OfferBuilderEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId || !getOfferProject(projectId)) {
    return <Navigate to="/workspace/offer-builder" replace />;
  }

  return (
    <OfferBuilderShellProvider>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <OfferBuilderUnifiedBar />
        <div className="min-h-0 flex-1 overflow-hidden">
          <OfferPuckEditor projectId={projectId} />
        </div>
      </div>
    </OfferBuilderShellProvider>
  );
}
