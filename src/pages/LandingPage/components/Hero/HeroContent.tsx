import { useEffect } from "react";
import type { MotionValue } from "framer-motion";
import { motion, useTransform, useMotionValue, animate } from "framer-motion";

type HeroContentProps = {
  scrollYProgress: MotionValue<number>;
};

export function HeroContent({ scrollYProgress }: HeroContentProps) {
  const mountProgress = useMotionValue(0);

  useEffect(() => {
    const controls = animate(mountProgress, 1, {
      duration: 0.9,
      ease: [0.75, 0, 0.25, 1],
    });
    return () => controls.stop();
  }, [mountProgress]);

  const scrollOpacity = useTransform(scrollYProgress, [0, 0.135], [1, 0]);
  const scrollBlur = useTransform(scrollYProgress, [0, 0.135], [0, 6]);
  const mountBlur = useTransform(mountProgress, (p) => (1 - p) * 6);

  const opacity = useTransform(
    [mountProgress, scrollOpacity],
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
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
    >
      <h1 className="max-w-4xl font-sans text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
        The Autonomous Studio Manager for Luxury Wedding Photographers.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 sm:text-xl">
        Let AI handle the inquiries, quotes, and timelines while you focus on
        the art.
      </p>
      <motion.button
        type="button"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ ease: [0.75, 0, 0.25, 1], duration: 0.35 }}
        className="mt-10 rounded-full border border-white/10 bg-white/5 px-8 py-3 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/10 hover:shadow-lg hover:shadow-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      >
        Request Early Access
      </motion.button>
    </motion.div>
  );
}
