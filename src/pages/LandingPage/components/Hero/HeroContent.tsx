import { useEffect } from "react";
import type { MotionValue } from "framer-motion";
import { motion, useTransform, useMotionValue, animate } from "framer-motion";

type HeroContentProps = {
  scrollYProgress: MotionValue<number>;
};

export function HeroContent({ scrollYProgress }: HeroContentProps) {
  const opacityProgress = useMotionValue(0);
  const blurProgress = useMotionValue(0);

  useEffect(() => {
    const fadeIn = animate(opacityProgress, 1, {
      duration: 0.8,
      delay: 0.15,
      ease: [0.25, 0.1, 0.25, 1],
    });
    const deblur = animate(blurProgress, 1, {
      duration: 2.2,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => { fadeIn.stop(); deblur.stop(); };
  }, [opacityProgress, blurProgress]);

  const scrollOpacity = useTransform(scrollYProgress, [0, 0.09, 0.667], [1, 0, 0]);
  const scrollBlur = useTransform(scrollYProgress, [0, 0.09, 0.667], [0, 6, 6]);
  const mountBlur = useTransform(blurProgress, (p) => (1 - p) * 10);

  const opacity = useTransform(
    [opacityProgress, scrollOpacity],
    ([m, s]) => (m as number) * (s as number),
  );

  const blurAmount = useTransform(
    [mountBlur, scrollBlur],
    ([mb, sb]) => (mb as number) + (sb as number),
  );

  const filter = useTransform(blurAmount, (b) => `blur(${b}px)`);

  return (
    <motion.div
      style={{ opacity, filter }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center transform-gpu will-change-transform"
    >
      <h1 className="text-display font-weak max-w-4xl text-white">
        Meet ANA.
      </h1>
      <p className="text-heading-2 font-weak mt-2 text-white/80">
        Your Autonomous Studio Manager.
      </p>
      <p className="text-body-small font-weak mt-6 max-w-2xl text-white/70">
        She handles your inbox, chases your leads, collects your payments, and
        delivers your galleries — so you can focus on what you love.
      </p>
      <div className="mt-12 flex items-center justify-center">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors duration-300 cursor-pointer"
        >
          <span className="text-body-small font-weak">Scroll</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
