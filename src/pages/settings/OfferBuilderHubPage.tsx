import type { Data } from "@measured/puck";
import Lenis from "lenis";
import { ExternalLink, FolderOpen, Plus, Trash2 } from "lucide-react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createOfferProject, deleteOfferProject, listOfferProjects, type OfferProjectRecord } from "../../lib/offerProjectsStorage";
import {
  getCachedOfferPreviewHtml,
  OFFER_HOVER_DESIGN_WIDTH_PX,
  OFFER_HOVER_VIEWPORT_HEIGHT_PX,
} from "./OfferHoverPreview";
import TiltedCard from "../../components/TiltedCard";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const PREVIEW_SCALE = 280 / OFFER_HOVER_DESIGN_WIDTH_PX;

export function OfferBuilderHubPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState(() => listOfferProjects());

  useEffect(() => {
    setProjects(listOfferProjects());
  }, [location.pathname]);

  const refresh = useCallback(() => setProjects(listOfferProjects()), []);

  const createNew = useCallback(() => {
    const p = createOfferProject();
    refresh();
    navigate(`/workspace/offer-builder/edit/${p.id}`);
  }, [navigate, refresh]);

  const openProject = useCallback(
    (id: string) => {
      navigate(`/workspace/offer-builder/edit/${id}`);
    },
    [navigate],
  );

  const removeProject = useCallback(
    (id: string) => {
      deleteOfferProject(id);
      refresh();
    },
    [refresh],
  );

  return (
    <div className="w-full">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Offer builder</h1>
        <p className="mt-1 max-w-lg text-[13px] text-muted-foreground">
          Create HTML magazine-style offers. The layout editor runs full screen when you open or create a project.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={createNew}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Create new project
        </button>
      </div>

      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Saved works</h3>
        <p className="mt-3 text-[13px] text-muted-foreground">Right-click a card for options; click to open.</p>

        {projects.length === 0 ? (
          <div className="mt-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderOpen className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No saved projects</EmptyTitle>
                <EmptyDescription>Create one to get started.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <button
                  type="button"
                  onClick={createNew}
                  className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition hover:bg-foreground/90"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Create new project
                </button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {projects.map((p) => (
              <ContextMenu key={p.id}>
                <ContextMenuTrigger asChild>
                  <ProjectTiltedCard project={p} onOpen={() => openProject(p.id)} />
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => openProject(p.id)}>
                    <ExternalLink className="mr-2 h-4 w-4" /> Open project
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem className="text-red-400" onClick={() => removeProject(p.id)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const ProjectTiltedCard = forwardRef<HTMLElement, { project: OfferProjectRecord; onOpen: () => void }>(
  function ProjectTiltedCard({ project, onOpen, ...rest }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const lenisRef = useRef<Lenis | null>(null);
    const rafRef = useRef(0);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const html = getCachedOfferPreviewHtml(project.data as Data, `project:${project.id}`);
      const onLoad = () => {
        setLoaded(true);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        lenisRef.current?.destroy();
        const lenis = new Lenis({
          wrapper: doc.documentElement,
          content: doc.body,
          duration: 1.2,
          easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
          smoothWheel: true,
          wheelMultiplier: 0.8,
        });
        lenisRef.current = lenis;

        const tick = (time: number) => {
          lenis.raf(time);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      };
      iframe.addEventListener("load", onLoad);
      iframe.srcdoc = html;
      return () => {
        iframe.removeEventListener("load", onLoad);
        cancelAnimationFrame(rafRef.current);
        lenisRef.current?.destroy();
      };
    }, [project.data, project.id]);

    const onWheel = useCallback((e: React.WheelEvent) => {
      e.stopPropagation();
      const lenis = lenisRef.current;
      if (lenis) {
        lenis.scrollTo(lenis.scroll + e.deltaY, { immediate: false });
      }
    }, []);

    return (
      <TiltedCard
        ref={ref}
        containerHeight="auto"
        containerWidth="100%"
        rotateAmplitude={10}
        scaleOnHover={1.04}
        showTooltip
        captionText={project.name}
        onClick={onOpen}
        {...rest}
      >
        <div
          className="relative overflow-hidden rounded-[15px] border border-border bg-[#fafaf9]"
          style={{ aspectRatio: "3/4" }}
          onWheel={onWheel}
        >
          <div
            className="pointer-events-none absolute left-0 top-0 origin-top-left"
            style={{
              width: OFFER_HOVER_DESIGN_WIDTH_PX,
              height: OFFER_HOVER_VIEWPORT_HEIGHT_PX,
              transform: `scale(${PREVIEW_SCALE})`,
            }}
          >
            <iframe
              ref={iframeRef}
              title={`preview-${project.id}`}
              sandbox="allow-same-origin"
              className="h-full w-full border-0"
              style={{
                opacity: loaded ? 1 : 0,
                transition: "opacity 0.3s",
              }}
            />
          </div>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-ink-muted">
              Loading…
            </div>
          )}
        </div>
      </TiltedCard>
    );
  },
);
