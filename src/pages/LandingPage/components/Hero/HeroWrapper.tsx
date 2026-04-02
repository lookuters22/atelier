import { useRef } from "react";
import { useScroll } from "framer-motion";
import { HeroScene } from "./HeroScene";

export function HeroWrapper() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  return (
    <div ref={ref} className="relative h-[450vh]">
      <HeroScene scrollYProgress={scrollYProgress} wrapperRef={ref} />
    </div>
  );
}
