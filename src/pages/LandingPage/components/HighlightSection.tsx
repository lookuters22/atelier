import { motion } from "framer-motion";

const IMAGE_SRC = "/landing/212.webp";

export function HighlightSection() {
  return (
    <section className="bg-[#F5F5F0] px-3 py-3">
      <div className="relative mx-auto h-[calc(100svh-24px)] w-full overflow-hidden rounded-[2rem] rounded-br-md bg-neutral-900">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
          className="absolute inset-0 transform-gpu will-change-transform"
        >
          <img
            src={IMAGE_SRC}
            alt="Luxury wedding photography"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </motion.div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-transparent" />

        <div className="absolute left-0 top-0 flex w-full flex-col items-start p-8 md:p-12 lg:p-14">
          <div className="text-mono-tiny mb-4 flex items-center gap-2 text-white/90">
            <span className="block h-1.5 w-1.5 bg-white" />
            Introducing Atelier Autopilot
          </div>

          <h2 className="text-heading-1 font-weak mb-8 max-w-[660px] text-white md:mb-11">
            Automate your client booking pipeline with Autopilot.
          </h2>

          <a href="#autopilot" className="glass-shell interactive-glass h-[52px] cursor-pointer rounded-[999px] shadow-[0_6px_12px_rgba(0,0,0,0.1)]">
            <span className="glass-inner justify-center px-10 text-body-small text-white whitespace-nowrap">
              Learn more
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
