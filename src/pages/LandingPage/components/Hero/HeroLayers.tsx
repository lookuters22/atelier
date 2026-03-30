import type { MotionValue } from "framer-motion";
import { motion, useTransform } from "framer-motion";

type HeroLayersProps = {
  scrollYProgress: MotionValue<number>;
};

const SKY_URL =
  "https://www.datocms-assets.com/157778/1769532446-v6-sky.png";
const ISLAND_URL =
  "https://www.datocms-assets.com/157778/1769190453-v5-island-1.png";
const TREES_URL =
  "https://www.datocms-assets.com/157778/1769186393-v5-background.png";
const FG_URL =
  "https://www.datocms-assets.com/157778/1769186789-v5-foreground-background-without-1.png";

const CLIP = "absolute inset-0 overflow-hidden";
const SLED = "absolute -inset-y-[15%] inset-x-0";
const IMG = "h-full w-full object-cover object-bottom";

export function HeroLayers({ scrollYProgress }: HeroLayersProps) {
  const ySky = useTransform(scrollYProgress, [0, 0.217, 1], ["0%", "0%", "-6%"]);
  const yIsland = useTransform(scrollYProgress, [0, 1], ["5%", "-18%"]);
  const yTrees = useTransform(scrollYProgress, [0, 1], ["4%", "-16%"]);
  const yFg = useTransform(scrollYProgress, [0, 1], ["0%", "-4%"]);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className={`${CLIP} z-0`}>
        <motion.div style={{ y: ySky }} className={SLED}>
          <img src={SKY_URL} alt="" className={`${IMG} hero-cloud-drift`} loading="eager" />
          <div className="absolute inset-0 bg-slate-950/40" />
        </motion.div>
      </div>

      <div className={`${CLIP} z-10`}>
        <motion.div style={{ y: yTrees }} className={SLED}>
          <img src={TREES_URL} alt="" className={IMG} loading="eager" />
        </motion.div>
      </div>

      <div className={`${CLIP} z-20`}>
        <motion.div style={{ y: yIsland }} className={SLED}>
          <img src={ISLAND_URL} alt="" className={IMG} loading="eager" />
          <div className="hero-water-shimmer absolute inset-0" />
        </motion.div>
      </div>

      <div className={`${CLIP} z-30`}>
        <motion.div style={{ y: yFg }} className={SLED}>
          <img src={FG_URL} alt="" className={IMG} loading="eager" />
        </motion.div>
      </div>
    </div>
  );
}
