import { cn } from "@/lib/utils";

type CinematicAuraTextProps = {
  text: string;
  /** Applied to the outer wrapper (e.g. size, weight, tracking, drop-shadow). */
  className?: string;
};

/** Display name in solid white (full opacity). */
export function CinematicAuraText({ text, className }: CinematicAuraTextProps) {
  return (
    <span className={cn("block text-white", className)}>{text}</span>
  );
}
