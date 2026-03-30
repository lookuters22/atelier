import { motion } from "framer-motion";

const EDITORIAL_EASE = [0.75, 0, 0.25, 1] as const;

export function ValueProposition() {
  /*
   * Palette: Editorial Ivory (active)
   * Alt – Obsidian:
   *   section:  bg-neutral-950
   *   h2:       text-neutral-50
   *   p:        text-neutral-400
   *   button:   bg-neutral-100 text-neutral-950
   */
  return (
    <section className="relative overflow-hidden bg-[#F5F5F0] px-6 py-40">
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-[340px] w-[540px] rounded-full bg-white/50 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, filter: "blur(4px)" }}
        whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: EDITORIAL_EASE }}
        viewport={{ once: true, margin: "-100px" }}
        className="relative mx-auto flex max-w-4xl flex-col items-center"
      >
        <h2 className="text-center text-4xl font-medium tracking-tight text-slate-900 md:text-5xl lg:text-[56px]">
          Art takes time.
          <br />
          Admin shouldn&rsquo;t.
        </h2>

        <p className="mx-auto mt-6 max-w-2xl text-center text-lg font-light text-slate-500 md:text-xl">
          An autonomous AI agent that handles inquiries, builds quotes, and
          chases invoices&mdash;so you can stay behind the lens.
        </p>

        <motion.a
          href="#early-access"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          transition={{ ease: EDITORIAL_EASE, duration: 0.35 }}
          className="mt-10 rounded-full border border-slate-900/15 bg-slate-900/5 px-6 py-3 text-sm font-medium text-slate-900 backdrop-blur-md transition-all hover:scale-105 hover:bg-slate-900/10"
        >
          Meet Your New Manager
        </motion.a>
      </motion.div>
    </section>
  );
}
