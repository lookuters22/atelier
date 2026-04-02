import { ArrowUpRight, Sparkles } from "lucide-react";
import { type CSSProperties, type PointerEvent, useRef, useState } from "react";

type FloatingCardConfig = {
  id: string;
  text: string;
  className: string;
  driftX: number;
  driftY: number;
  centerX: number;
  centerY: number;
  ghost?: boolean;
  size?: "main" | "small";
};

const floatingCards: FloatingCardConfig[] = [
  {
    id: "reorder",
    text: "Create an app that recommends which products I need to reorder.",
    className: "left-[8%] top-[49%] w-[18rem] md:w-[20rem]",
    driftX: -18,
    driftY: -18,
    centerX: 28,
    centerY: 57,
  },
  {
    id: "returns",
    text: "Create an app that checks returns and cancellation eligibility for orders.",
    className: "left-[40%] top-[34%] w-[15rem] md:w-[17rem]",
    driftX: 12,
    driftY: -14,
    centerX: 55,
    centerY: 40,
  },
  {
    id: "discount-links",
    text: "Create an event prep app that generates discounted checkout links for selected products.",
    className: "right-[6%] top-[24%] w-[17rem] md:w-[19rem]",
    driftX: 18,
    driftY: -14,
    centerX: 83,
    centerY: 32,
  },
  {
    id: "b2b-import",
    text: "Create a bulk B2B company importer that uploads companies from a CSV file.",
    className: "right-[10%] top-[58%] w-[18.5rem] md:w-[20.5rem]",
    driftX: 16,
    driftY: -16,
    centerX: 74,
    centerY: 66,
  },
  {
    id: "task-tracker",
    text: "Create a task tracker for my whole team.",
    className: "left-[28%] top-[72%] w-[12rem] md:w-[13.5rem]",
    driftX: -10,
    driftY: -10,
    centerX: 42,
    centerY: 79,
    ghost: true,
  },
  {
    id: "inventory-sync",
    text: "Create a low-stock sync app for warehouse transfers.",
    className: "left-[49%] top-[11%] w-[8.5rem] md:w-[9.5rem]",
    driftX: 8,
    driftY: -8,
    centerX: 56,
    centerY: 15,
    ghost: true,
    size: "small",
  },
  {
    id: "prep-checklist",
    text: "Create a wedding prep checklist app.",
    className: "left-[70%] top-[10%] w-[7rem] md:w-[7.75rem]",
    driftX: 8,
    driftY: -8,
    centerX: 75,
    centerY: 15,
    ghost: true,
    size: "small",
  },
  {
    id: "quote-bot",
    text: "Generate a quote follow-up app.",
    className: "left-[2%] top-[61%] w-[7rem] md:w-[7.75rem]",
    driftX: -8,
    driftY: -6,
    centerX: 7,
    centerY: 66,
    ghost: true,
    size: "small",
  },
  {
    id: "csv-mapper",
    text: "Map CSV columns to custom fields.",
    className: "left-[57%] top-[47%] w-[7.25rem] md:w-[8rem]",
    driftX: 8,
    driftY: -6,
    centerX: 60,
    centerY: 51,
    ghost: true,
    size: "small",
  },
  {
    id: "vendor-portal",
    text: "Create a vendor portal status app.",
    className: "right-[1%] top-[38%] w-[7rem] md:w-[7.75rem]",
    driftX: 8,
    driftY: -6,
    centerX: 92,
    centerY: 42,
    ghost: true,
    size: "small",
  },
  {
    id: "internal-reminders",
    text: "Build internal reminder automations.",
    className: "right-[2%] top-[75%] w-[7rem] md:w-[7.75rem]",
    driftX: 8,
    driftY: -6,
    centerX: 91,
    centerY: 78,
    ghost: true,
    size: "small",
  },
];

const backgroundGhosts = [
  "left-[3%] top-[41%] w-24",
  "left-[7%] top-[69%] w-18",
  "left-[18%] top-[29%] w-14",
  "left-[23%] top-[59%] w-24",
  "left-[28%] top-[85%] w-14",
  "left-[39%] top-[27%] w-14",
  "left-[45%] top-[18%] w-20",
  "left-[49%] top-[56%] w-14",
  "left-[56%] top-[10%] w-22",
  "left-[63%] top-[34%] w-20",
  "left-[69%] top-[12%] w-14",
  "left-[74%] top-[49%] w-14",
  "left-[82%] top-[69%] w-18",
  "left-[87%] top-[37%] w-16",
];

const nodes = [
  { cx: 10, cy: 18, r: 1.6 },
  { cx: 24, cy: 8, r: 1.3 },
  { cx: 38, cy: 24, r: 1.4 },
  { cx: 53, cy: 14, r: 1.2 },
  { cx: 70, cy: 22, r: 1.4 },
  { cx: 82, cy: 10, r: 1.1 },
  { cx: 28, cy: 54, r: 1.6 },
  { cx: 40, cy: 46, r: 1.3 },
  { cx: 57, cy: 61, r: 1.8 },
  { cx: 73, cy: 52, r: 1.4 },
  { cx: 33, cy: 75, r: 1.2 },
  { cx: 61, cy: 86, r: 1.4 },
];

const lines = [
  ["10 18", "38 24"],
  ["24 8", "53 14"],
  ["38 24", "57 61"],
  ["53 14", "82 10"],
  ["28 54", "40 46"],
  ["40 46", "57 61"],
  ["57 61", "73 52"],
  ["33 75", "57 61"],
  ["57 61", "61 86"],
  ["28 54", "10 18"],
];

function FloatingPromptCard({
  card,
  isStageActive,
  isActive,
}: {
  card: FloatingCardConfig;
  isStageActive: boolean;
  isActive: boolean;
}) {
  const opacity = card.ghost
    ? isStageActive
      ? isActive
        ? 0.42
        : 0.14
      : card.size === "small"
        ? 0.13
        : 0.2
    : isStageActive
      ? isActive
        ? 1
        : 0.36
      : 0.84;

  const scale = card.ghost ? (isActive ? 1.015 : 0.985) : isActive ? 1.025 : 0.988;
  const translateX = isActive ? card.driftX * 0.38 : isStageActive ? card.driftX * 0.12 : 0;
  const translateY = isActive ? card.driftY * 0.36 - 2 : isStageActive ? card.driftY * 0.1 : 0;
  const shadow = card.ghost
    ? "0 12px 22px rgba(146, 131, 97, 0.08)"
    : isActive
      ? "0 20px 34px rgba(171, 160, 128, 0.18), 0 0 0 1px rgba(255,255,255,0.84)"
      : "0 12px 24px rgba(140, 126, 90, 0.12)";

  return (
    <article
      className={`pointer-events-none absolute ${card.className} transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]`}
      style={{
        opacity,
        transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
        willChange: "transform, opacity",
      }}
    >
      <div
        className={`relative overflow-hidden rounded-[1.28rem] border ${
          card.ghost ? "border-white/30" : "border-white/65"
        } ${
          card.ghost
            ? card.size === "small"
              ? "px-3 py-2.5"
              : "px-4 py-3"
            : "px-4 py-4 md:px-5 md:py-5"
        }`}
        style={{
          background: card.ghost
            ? card.size === "small"
              ? "rgba(255,255,255,0.28)"
              : "rgba(255,255,255,0.42)"
            : "rgba(255,255,255,0.86)",
          boxShadow: shadow,
        }}
      >
        {!card.ghost ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(120deg, rgba(255,255,255,0.34), rgba(255,255,255,0.1) 26%, rgba(255,255,255,0.03) 44%, transparent 62%)",
                opacity: isActive ? 0.76 : 0.22,
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[1px] rounded-[inherit]"
              style={{
                border: `1px solid ${isActive ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.48)"}`,
              }}
            />
          </>
        ) : null}

        <div
          className={`relative flex items-start justify-between gap-4 ${
            card.ghost
              ? card.size === "small"
                ? "min-h-[2.1rem] md:min-h-[2.3rem]"
                : "min-h-[3rem] md:min-h-[3.2rem]"
              : "min-h-[3.6rem] md:min-h-[4.2rem]"
          }`}
        >
          <p
            className={
              card.ghost
                ? card.size === "small"
                  ? "max-w-[18ch] text-[0.48rem] leading-[1.32] text-[#cbc4b6] md:text-[0.56rem]"
                  : "max-w-[20ch] text-[0.58rem] leading-[1.35] text-[#bdb5a7] md:text-[0.72rem]"
                : "text-editorial-card max-w-[21ch]"
            }
            style={{ color: card.ghost ? undefined : isActive ? "#5f5b54" : "#c2bcaf" }}
          >
            {card.text}
          </p>
        </div>

        <div className={`relative flex items-center justify-between ${card.ghost ? "mt-2" : "mt-3"}`}>
          <span
            className={`inline-flex items-center justify-center rounded-full border ${
              card.ghost && card.size === "small" ? "size-4 md:size-[1.05rem]" : "size-5 md:size-6"
            }`}
            style={{
              borderColor: isActive ? "rgba(123, 91, 248, 0.65)" : "rgba(228, 221, 242, 0.88)",
              background: isActive ? "rgba(244, 237, 255, 0.95)" : "rgba(246, 241, 255, 0.7)",
              color: isActive ? "#6f4ff3" : "#b6a6e7",
            }}
          >
            <Sparkles
              className={card.ghost && card.size === "small" ? "size-2 md:size-2.5" : "size-2.5 md:size-3"}
              strokeWidth={2}
            />
          </span>
          <span
            className={`inline-flex items-center justify-center rounded-full ${
              card.ghost && card.size === "small" ? "size-4 md:size-[1.05rem]" : "size-5 md:size-6"
            }`}
            style={{
              background: isActive ? "#8d6af6" : "rgba(239,236,231,0.82)",
              color: isActive ? "#ffffff" : "#d1cdc6",
            }}
          >
            <ArrowUpRight
              className={card.ghost && card.size === "small" ? "size-2 md:size-2.5" : "size-2.5 md:size-3"}
              strokeWidth={2.3}
            />
          </span>
        </div>
      </div>
    </article>
  );
}

export function CustomAppGenerationSection() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activeCardIdRef = useRef<string | null>(null);
  const stageActiveRef = useRef(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isStageActive, setIsStageActive] = useState(false);

  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;

    const bounds = stage.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      let nextActive: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const card of floatingCards) {
        const dx = x - card.centerX;
        const dy = y - card.centerY;
        const weight = card.ghost ? 1.5 : 1;
        const distance = Math.hypot(dx, dy) * weight;

        if (distance < bestDistance) {
          bestDistance = distance;
          nextActive = card.id;
        }
      }

      const activeCard = floatingCards.find((card) => card.id === nextActive && !card.ghost) ?? null;
      const glowX = activeCard ? activeCard.centerX + (x - activeCard.centerX) * 0.22 : x;
      const glowY = activeCard ? activeCard.centerY + (y - activeCard.centerY) * 0.22 : y;

      stage.style.setProperty("--custom-app-pointer-x", `${x}%`);
      stage.style.setProperty("--custom-app-pointer-y", `${y}%`);
      stage.style.setProperty("--custom-app-glow-x", `${glowX}%`);
      stage.style.setProperty("--custom-app-glow-y", `${glowY}%`);

      if (!stageActiveRef.current) {
        stageActiveRef.current = true;
        setIsStageActive(true);
      }

      if (activeCardIdRef.current !== nextActive) {
        activeCardIdRef.current = nextActive;
        setActiveCardId(nextActive);
      }
    });
  };

  const handleStagePointerLeave = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const stage = stageRef.current;
    if (stage) {
      stage.style.setProperty("--custom-app-pointer-x", "50%");
      stage.style.setProperty("--custom-app-pointer-y", "50%");
      stage.style.setProperty("--custom-app-glow-x", "50%");
      stage.style.setProperty("--custom-app-glow-y", "50%");
    }

    activeCardIdRef.current = null;
    stageActiveRef.current = false;
    setActiveCardId(null);
    setIsStageActive(false);
  };

  return (
    <section className="relative overflow-hidden bg-[#efede2] px-5 py-24 text-[#2c2a23] md:px-8 md:py-32 lg:px-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.58),transparent_17%),radial-gradient(circle_at_66%_38%,rgba(255,255,255,0.44),transparent_18%),radial-gradient(circle_at_48%_76%,rgba(255,255,255,0.34),transparent_22%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent_28%,rgba(255,255,255,0.07)_50%,transparent_72%,rgba(255,255,255,0.12))]" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {lines.map(([from, to]) => (
            <line
              key={`${from}-${to}`}
              x1={from.split(" ")[0]}
              y1={from.split(" ")[1]}
              x2={to.split(" ")[0]}
              y2={to.split(" ")[1]}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="0.08"
            />
          ))}
          {nodes.map((node, index) => (
            <circle key={`${node.cx}-${node.cy}-${index}`} cx={node.cx} cy={node.cy} r={node.r} fill="rgba(255,255,255,0.42)" />
          ))}
        </svg>

        {backgroundGhosts.map((className) => (
          <div
            key={className}
            className={`absolute ${className} rounded-2xl border border-white/30 bg-white/34 p-3 shadow-[0_10px_18px_rgba(126,111,82,0.05)]`}
          >
            <div className="mb-3 h-2.5 w-3/4 rounded-full bg-[#ece6da]/80" />
            <div className="h-2 w-1/2 rounded-full bg-[#ece6da]/72" />
            <div className="mt-4 flex items-center justify-between">
              <div className="size-3 rounded-full bg-[#ece6da]/72" />
              <div className="size-3 rounded-full bg-[#ece6da]/72" />
            </div>
          </div>
        ))}
      </div>

      <div className="relative mx-auto grid max-w-[1380px] gap-12 lg:grid-cols-[0.8fr_1.9fr] lg:gap-6">
        <div className="relative z-10 max-w-[27rem] pt-2">
          <p className="mb-3 text-heading-4 font-bold tracking-[-0.04em] text-[#2f2d27]">Custom app generation</p>
          <h2 className="text-heading-1 font-weak max-w-[9.6ch] leading-[0.92] tracking-[-0.06em] text-[#312b23]">
            Get Sidekick to build custom apps designed specifically for your business needs.
          </h2>
          <a
            href="#"
            className="text-body-small font-bold mt-6 inline-flex items-center gap-2 rounded-md border border-[#d8d2c6] bg-[#faf8f2]/90 px-3 py-2 text-[#27251f] shadow-[0_6px_18px_rgba(157,144,114,0.12)] transition-transform duration-300 hover:-translate-y-0.5"
          >
            Read help doc
            <ArrowUpRight className="size-3.5" strokeWidth={2.4} />
          </a>
        </div>

        <div
          ref={stageRef}
          className="custom-app-stage relative min-h-[33rem] md:min-h-[41rem] lg:min-h-[45rem] xl:min-h-[46rem]"
          onPointerMove={handleStagePointerMove}
          onPointerLeave={handleStagePointerLeave}
          style={
            {
              "--custom-app-pointer-x": "50%",
              "--custom-app-pointer-y": "50%",
              "--custom-app-glow-x": "50%",
              "--custom-app-glow-y": "50%",
            } as CSSProperties
          }
        >
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
              isStageActive ? "opacity-100" : "opacity-0"
            }`}
          >
            <div
              className="absolute inset-[-8%] will-change-transform"
              style={{
                backgroundImage:
                  "radial-gradient(circle at var(--custom-app-glow-x) var(--custom-app-glow-y), rgba(158,119,255,0.26), rgba(158,119,255,0.13) 14%, rgba(158,119,255,0) 34%), radial-gradient(circle at calc(var(--custom-app-glow-x) - 13%) calc(var(--custom-app-glow-y) + 9%), rgba(255,199,220,0.22), rgba(255,199,220,0.09) 16%, rgba(255,199,220,0) 36%), radial-gradient(circle at calc(var(--custom-app-glow-x) + 15%) calc(var(--custom-app-glow-y) - 8%), rgba(185,223,255,0.22), rgba(185,223,255,0.09) 16%, rgba(185,223,255,0) 36%)",
                filter: "blur(32px)",
                transform: "translateZ(0)",
              }}
            />
          </div>

          {floatingCards.map((card) => (
            <FloatingPromptCard
              key={card.id}
              card={card}
              isStageActive={isStageActive}
              isActive={activeCardId === card.id}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
