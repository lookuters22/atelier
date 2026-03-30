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
          className="absolute inset-0"
        >
          <img
            src={IMAGE_SRC}
            alt="Luxury wedding photography"
            className="h-full w-full object-cover"
          />
        </motion.div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-transparent" />

        <div className="absolute left-0 top-0 flex w-full flex-col items-start p-8 md:p-12 lg:p-14">
          <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/90 md:text-xs">
            <span className="block h-1.5 w-1.5 bg-white" />
            Introducing Atelier Autopilot
          </div>

          <h2 className="mb-8 max-w-[660px] text-3xl font-medium leading-[1.1] tracking-tight text-white md:mb-11 md:text-5xl lg:text-[56px]">
            Automate your client booking pipeline with Autopilot.
          </h2>

          <a
            href="#autopilot"
            className="cursor-pointer rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-medium text-white backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20"
          >
            Learn more
          </a>
        </div>
      </div>
    </section>
  );
}
