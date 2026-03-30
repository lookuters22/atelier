import { useCallback, useState } from "react";
import type { MotionValue } from "framer-motion";
import { AnimatePresence, motion } from "framer-motion";
import { HeroContent } from "./HeroContent";
import { Hero3DScene } from "./Hero3DScene";

const LOADER_IMG =
  "https://www.datocms-assets.com/157778/1769187217-phone-screen-reflection-with-lighting.png";

type HeroSceneProps = {
  scrollYProgress: MotionValue<number>;
};

export function HeroScene({ scrollYProgress }: HeroSceneProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const handleLoaded = useCallback(() => setIsLoaded(true), []);

  return (
    <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden bg-slate-950">
      <Hero3DScene scrollYProgress={scrollYProgress} onLoaded={handleLoaded} />

      <AnimatePresence>
        {!isLoaded && (
          <motion.div
            key="loader"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.75, 0, 0.25, 1] }}
            className="absolute inset-0 z-[2] flex items-center justify-center"
          >
            <img
              src={LOADER_IMG}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="relative z-10 flex items-baseline gap-[2px] text-sm font-semibold text-white/40">
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

      {isLoaded && <HeroContent scrollYProgress={scrollYProgress} />}
    </div>
  );
}
