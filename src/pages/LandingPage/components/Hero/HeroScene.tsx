import { useCallback, useState, type RefObject } from "react";
import type { MotionValue } from "framer-motion";
import { AnimatePresence, motion, useTransform } from "framer-motion";
import { HeroContent } from "./HeroContent";
import { Hero3DScene } from "./Hero3DScene";
import { ScrollReveal, ScrollRevealBlock } from "../../../../components/ScrollReveal";

const LOADER_IMG =
  "https://www.datocms-assets.com/157778/1769187217-phone-screen-reflection-with-lighting.png";

type HeroSceneProps = {
  scrollYProgress: MotionValue<number>;
  wrapperRef: RefObject<HTMLDivElement | null>;
};

export function HeroScene({ scrollYProgress, wrapperRef }: HeroSceneProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const handleLoaded = useCallback(() => setIsLoaded(true), []);

  const textParallaxY = useTransform(scrollYProgress, [0.10, 0.27, 0.667], [40, -60, -60]);

  return (
    <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden bg-slate-950 transform-gpu will-change-transform">
      <Hero3DScene scrollYProgress={scrollYProgress} onLoaded={handleLoaded} />

      <AnimatePresence>
        {!isLoaded && (
          <motion.div
            key="loader"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.75, 0, 0.25, 1] }}
            className="absolute inset-0 z-40 flex items-center justify-center"
          >
            <img
              src={LOADER_IMG}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="relative z-10 flex items-baseline gap-[2px] text-body-tiny text-white/40">
              <span>Loading</span>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.2,
                  }}
                >
                  .
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <HeroContent scrollYProgress={scrollYProgress} />

      <div className="pointer-events-none absolute inset-0 z-30 flex w-full items-center justify-center px-6 lg:w-[54%] lg:justify-end lg:pr-14 xl:pr-20">
        <motion.div
          style={{ y: textParallaxY }}
          className="relative flex h-auto w-full max-w-[480px] flex-col items-center justify-center text-center pointer-events-auto lg:items-end lg:text-right transform-gpu will-change-transform"
        >
          <ScrollReveal
            triggerRef={wrapperRef}
            startTrigger="34% top"
            endTrigger="44% top"
            baseRotation={8}
            blurStrength={10}
            baseOpacity={0}
            containerClassName="mb-6"
            textClassName="text-mono-tiny text-white/90 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
          >
            The assistant you always needed, finally exists.
          </ScrollReveal>

          <div className="text-heading-1 font-bold relative z-10 mb-8 text-white drop-shadow-[0_10px_35px_rgba(0,0,0,0.45)]">
            <ScrollReveal
              triggerRef={wrapperRef}
              startTrigger="20% top"
              endTrigger="32% top"
              baseRotation={8}
              blurStrength={10}
              baseOpacity={0}
              textClassName=""
            >
              Clients talk.
            </ScrollReveal>
            <ScrollRevealBlock
              triggerRef={wrapperRef}
              startTrigger="30% top"
              endTrigger="40% top"
              baseRotation={8}
              blurStrength={10}
              baseOpacity={0}
            >
              <motion.mark
                animate={{ backgroundPositionX: ["100%", "0%"] }}
                transition={{ duration: 3, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
                className="inline-block"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #fff 0%, #fff 35%, #ff8e3e 50%, #fff 65%, #fff 100%)",
                  backgroundSize: "300% 100%",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  color: "transparent",
                }}
              >
                Ana talks back.
              </motion.mark>
            </ScrollRevealBlock>
          </div>

          <ScrollReveal
            triggerRef={wrapperRef}
            startTrigger="38% top"
            endTrigger="48% top"
            baseRotation={6}
            blurStrength={10}
            baseOpacity={0}
            textClassName="text-body-small font-weak text-slate-100 drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)]"
          >
            She manages everything from the inquiry to delivery, and more.
          </ScrollReveal>
        </motion.div>
      </div>
    </div>
  );
}
