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
        <div className="h-[280px] w-[440px] rounded-full bg-white/40 blur-[48px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EDITORIAL_EASE }}
        viewport={{ once: true, margin: "-100px" }}
        className="relative mx-auto flex max-w-4xl flex-col items-center"
      >
        <h2 className="text-heading-2 font-weak text-center text-[#47201c]">
          Art takes time.
          <br />
          Admin shouldn&rsquo;t.
        </h2>

        <p className="text-body-small font-weak mx-auto mt-4 max-w-xl text-center text-[#47201c]/70">
          An autonomous AI agent that handles inquiries, builds quotes, and
          chases invoices&mdash;so you can stay behind the lens.
        </p>

        <a href="#early-access" className="cleo-cta mt-10">
          <span className="cleo-cta__inner text-body-small text-[#47201c]">Meet Your New Manager</span>
        </a>
      </motion.div>
    </section>
  );
}
