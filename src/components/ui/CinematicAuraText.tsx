import { cn } from "@/lib/utils";

type CinematicAuraTextProps = {
  text: string;
  /** Applied to the outer wrapper (e.g. size, weight, tracking, drop-shadow). Children inherit typography. */
  className?: string;
};

/**
 * Two-layer name treatment: dim base “ink” plus a text-clipped radial spotlight (static).
 */
export function CinematicAuraText({ text, className }: CinematicAuraTextProps) {
  return (
    <div className={cn("relative inline-block", className)}>
      <span className="block text-white/30">{text}</span>
      <span
        className="pointer-events-none absolute left-0 top-0 block h-full w-full text-transparent"
        style={{
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          backgroundImage:
            "radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(253,230,200,0.35) 38%, rgba(167,139,250,0.12) 58%, rgba(255,255,255,0) 72%)",
          backgroundSize: "220% 220%",
          backgroundPosition: "50% 50%",
          backgroundRepeat: "no-repeat",
        }}
      >
        {text}
      </span>
    </div>
  );
}
