import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { inlineEditStopDragProps, useInlineEditStopDrag } from "./inlineEditStopDrag";

export type InlineImageDraft = {
  src: string;
  fit: "cover" | "contain";
  focalX: number;
  focalY: number;
  zoom: number;
};

export type InlineImageEditorState<T extends InlineImageDraft = InlineImageDraft> = {
  draft: T;
  frameRect: DOMRect;
  naturalWidth: number;
  naturalHeight: number;
};

type CropInteraction =
  | { type: "move"; startX: number; startY: number; originLeft: number; originTop: number }
  | { type: "resize"; startX: number; startY: number; originZoom: number };

type InlineImageFrameEditorProps<T extends InlineImageDraft, S extends InlineImageEditorState<T> = InlineImageEditorState<T>> = {
  editor: S | null;
  setEditor: React.Dispatch<React.SetStateAction<S | null>>;
  onCommit: () => void;
  onCancel: () => void;
  minZoom?: number;
  maxZoom?: number;
  hintText?: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getImagePlacement(
  frameWidth: number,
  frameHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  fit: InlineImageDraft["fit"],
  zoom: number,
  focalX: number,
  focalY: number,
) {
  const safeNaturalWidth = Math.max(1, naturalWidth || frameWidth);
  const safeNaturalHeight = Math.max(1, naturalHeight || frameHeight);
  const frameAspect = frameWidth / Math.max(1, frameHeight);
  const imageAspect = safeNaturalWidth / safeNaturalHeight;

  let baseWidth: number;
  let baseHeight: number;

  if (fit === "contain") {
    if (imageAspect >= frameAspect) {
      baseWidth = frameWidth;
      baseHeight = frameWidth / imageAspect;
    } else {
      baseHeight = frameHeight;
      baseWidth = frameHeight * imageAspect;
    }
  } else if (imageAspect >= frameAspect) {
    baseHeight = frameHeight;
    baseWidth = frameHeight * imageAspect;
  } else {
    baseWidth = frameWidth;
    baseHeight = frameWidth / imageAspect;
  }

  const width = baseWidth * zoom;
  const height = baseHeight * zoom;
  return {
    width,
    height,
    left: (focalX / 100) * (frameWidth - width),
    top: (focalY / 100) * (frameHeight - height),
  };
}

export function normalizeInlineImageDraft<T extends InlineImageDraft>(draft: T, minZoom = 1, maxZoom = 2.4): T {
  return {
    ...draft,
    fit: draft.fit === "contain" ? "contain" : "cover",
    focalX: clamp(Number.isFinite(draft.focalX) ? draft.focalX : 50, 0, 100),
    focalY: clamp(Number.isFinite(draft.focalY) ? draft.focalY : 50, 0, 100),
    zoom: clamp(Number.isFinite(draft.zoom) ? draft.zoom : 1, minZoom, maxZoom),
  };
}

export function InlineImageFrameEditor<T extends InlineImageDraft, S extends InlineImageEditorState<T> = InlineImageEditorState<T>>({
  editor,
  setEditor,
  onCommit,
  onCancel,
  minZoom = 1,
  maxZoom = 2.4,
  hintText = "Drag image to reposition",
}: InlineImageFrameEditorProps<T, S>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const moveLayerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<S | null>(null);
  const interactionRef = useRef<CropInteraction | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);

  useInlineEditStopDrag(stageRef, Boolean(editor), editor?.frameRect);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    setHintDismissed(false);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      } else if (event.key === "Enter") {
        event.preventDefault();
        onCommit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editor, onCancel, onCommit]);

  useEffect(() => {
    if (!editor) return;

    const onWindowPointerDown = (event: PointerEvent) => {
      if (interactionRef.current) return;
      const stage = stageRef.current;
      const target = event.target as Node | null;
      if (!stage || !target || stage.contains(target)) return;
      onCommit();
    };

    window.addEventListener("pointerdown", onWindowPointerDown, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onWindowPointerDown, { capture: true });
    };
  }, [editor, onCommit]);

  useEffect(() => {
    const stage = stageRef.current;
    const moveLayer = moveLayerRef.current;
    if (!editor || !stage || !moveLayer) return;

    const stopEvent = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const updateMove = (event: PointerEvent, current: S, interaction: Extract<CropInteraction, { type: "move" }>) => {
      const frameWidth = current.frameRect.width;
      const frameHeight = current.frameRect.height;
      const placement = getImagePlacement(
        frameWidth,
        frameHeight,
        current.naturalWidth,
        current.naturalHeight,
        current.draft.fit,
        current.draft.zoom,
        current.draft.focalX,
        current.draft.focalY,
      );
      const minLeft = Math.min(0, frameWidth - placement.width);
      const maxLeft = Math.max(0, frameWidth - placement.width);
      const minTop = Math.min(0, frameHeight - placement.height);
      const maxTop = Math.max(0, frameHeight - placement.height);
      const nextLeft = clamp(interaction.originLeft + (event.clientX - interaction.startX), minLeft, maxLeft);
      const nextTop = clamp(interaction.originTop + (event.clientY - interaction.startY), minTop, maxTop);
      const horizontalSpan = frameWidth - placement.width;
      const verticalSpan = frameHeight - placement.height;
      const nextX = Math.abs(horizontalSpan) < 0.5 ? current.draft.focalX : clamp((nextLeft / horizontalSpan) * 100, 0, 100);
      const nextY = Math.abs(verticalSpan) < 0.5 ? current.draft.focalY : clamp((nextTop / verticalSpan) * 100, 0, 100);

      setEditor((prev) =>
        prev
          ? ({
              ...prev,
              draft: normalizeInlineImageDraft(
                {
                  ...prev.draft,
                  focalX: nextX,
                  focalY: nextY,
                },
                minZoom,
                maxZoom,
              ) as T,
            } as S)
          : prev,
      );
    };

    const updateResize = (event: PointerEvent, interaction: Extract<CropInteraction, { type: "resize" }>) => {
      const delta = ((event.clientX - interaction.startX) + (event.clientY - interaction.startY)) / 220;
      setEditor((prev) =>
        prev
          ? ({
              ...prev,
              draft: normalizeInlineImageDraft(
                {
                  ...prev.draft,
                  zoom: interaction.originZoom + delta,
                },
                minZoom,
                maxZoom,
              ) as T,
            } as S)
          : prev,
      );
    };

    const resizeHandle = stage.querySelector<HTMLElement>("[data-inline-image-resize]");

    const onWindowPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Node | null;
      const current = editorRef.current;
      if (!target || !current) return;

      if (resizeHandle?.contains(target)) {
        stopEvent(event);
        interactionRef.current = {
          type: "resize",
          startX: event.clientX,
          startY: event.clientY,
          originZoom: current.draft.zoom,
        };
        try {
          resizeHandle.setPointerCapture(event.pointerId);
        } catch {
          /* noop */
        }
        return;
      }

      if (!moveLayer.contains(target)) return;
      stopEvent(event);
      setHintDismissed(true);
      const placement = getImagePlacement(
        current.frameRect.width,
        current.frameRect.height,
        current.naturalWidth,
        current.naturalHeight,
        current.draft.fit,
        current.draft.zoom,
        current.draft.focalX,
        current.draft.focalY,
      );
      interactionRef.current = {
        type: "move",
        startX: event.clientX,
        startY: event.clientY,
        originLeft: placement.left,
        originTop: placement.top,
      };
      try {
        moveLayer.setPointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
    };

    const onWindowPointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      const current = editorRef.current;
      if (!interaction || !current) return;
      stopEvent(event);
      if (interaction.type === "move") updateMove(event, current, interaction);
      else updateResize(event, interaction);
    };

    const onWindowPointerUp = (event: PointerEvent) => {
      if (!interactionRef.current) return;
      stopEvent(event);
      interactionRef.current = null;
      try {
        moveLayer.releasePointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
      try {
        resizeHandle?.releasePointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
    };

    window.addEventListener("pointerdown", onWindowPointerDown, { capture: true });
    window.addEventListener("pointermove", onWindowPointerMove, { capture: true });
    window.addEventListener("pointerup", onWindowPointerUp, { capture: true });
    window.addEventListener("pointercancel", onWindowPointerUp, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", onWindowPointerDown, { capture: true });
      window.removeEventListener("pointermove", onWindowPointerMove, { capture: true });
      window.removeEventListener("pointerup", onWindowPointerUp, { capture: true });
      window.removeEventListener("pointercancel", onWindowPointerUp, { capture: true });
    };
  }, [editor, maxZoom, minZoom, setEditor]);

  if (!editor) return null;

  const placement = getImagePlacement(
    editor.frameRect.width,
    editor.frameRect.height,
    editor.naturalWidth,
    editor.naturalHeight,
    editor.draft.fit,
    editor.draft.zoom,
    editor.draft.focalX,
    editor.draft.focalY,
  );

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[180]">
      <style>{`
        @keyframes offer-drag-hint-slide {
          0%, 100% { transform: translateX(0); opacity: 0.55; }
          50% { transform: translateX(6px); opacity: 1; }
        }
        @keyframes offer-drag-hand-sweep {
          0% { transform: translateX(-14px); opacity: 0.72; }
          50% { transform: translateX(14px); opacity: 1; }
          100% { transform: translateX(-14px); opacity: 0.72; }
        }
      `}</style>
      <div
        ref={stageRef}
        className="pointer-events-auto absolute overflow-visible"
        style={{
          left: editor.frameRect.left,
          top: editor.frameRect.top,
          width: editor.frameRect.width,
          height: editor.frameRect.height,
        }}
        {...inlineEditStopDragProps}
      >
        <div
          ref={moveLayerRef}
          className="absolute cursor-move [-webkit-user-drag:none]"
          style={{
            left: placement.left,
            top: placement.top,
            width: placement.width,
            height: placement.height,
            touchAction: "none",
            userSelect: "none",
          }}
          {...inlineEditStopDragProps}
        >
          <img
            src={editor.draft.src}
            alt=""
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="pointer-events-none absolute inset-0 h-full w-full select-none [-webkit-user-drag:none]"
            style={{
              maxWidth: "none",
              objectFit: "fill",
              userSelect: "none",
            }}
          />
          <div className="pointer-events-none absolute inset-0 border border-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
        </div>
        <div className="pointer-events-none absolute inset-0 border border-white/95 shadow-[0_0_0_1px_rgba(255,255,255,0.25)]" />
        <div
          className={
            "pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-300 " +
            (hintDismissed ? "scale-95 opacity-0" : "scale-100 opacity-100")
          }
        >
          <span
            className="font-sans inline-flex flex-col items-center gap-2 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-white/82"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.45)", fontFamily: "var(--font-sans)" }}
          >
            <span className="relative flex h-9 w-24 items-center justify-center" aria-hidden>
              <span className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-white/0 via-white/30 to-white/0" />
              <span
                className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/78 shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-xl"
                style={{ animation: "offer-drag-hand-sweep 1.55s ease-in-out infinite" }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-black/65" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V10" />
                  <path d="M11 10V5.5a1.5 1.5 0 0 1 3 0V10" />
                  <path d="M14 10V6.5a1.5 1.5 0 0 1 3 0V11" />
                  <path d="M8 10.5V9a1.5 1.5 0 0 0-3 0v4.5c0 4 2.8 6.5 6.8 6.5H14c3.3 0 6-2.7 6-6v-2.5a1.5 1.5 0 0 0-3 0V12" />
                </svg>
              </span>
            </span>
            <span>{hintText}</span>
          </span>
        </div>
        <button
          type="button"
          data-inline-image-resize
          aria-label="Scale image"
          className="absolute bottom-1 right-1 z-40 h-3.5 w-3.5 rounded-sm border-2 border-[var(--puck-color-azure-04)] bg-white shadow-sm"
          style={{ touchAction: "none" }}
          {...inlineEditStopDragProps}
        />
        <div className="absolute right-1 top-1 z-40 flex items-center gap-2">
          <button
            type="button"
            className="rounded-full bg-black/78 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-lg"
            {...inlineEditStopDragProps}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black shadow-lg"
            {...inlineEditStopDragProps}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCommit();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
