import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const features = [
  {
    id: "inquiries",
    tabLabel: "Inquiries",
    eyebrow: "Lead Qualification",
    title: "Say yes to the right clients.",
    body: "Let your agent handle the initial back-and-forth. Instantly qualify leads and send tailored pricing guides based on their venue and date.",
    cta: "Learn more",
    image: "/landing/inquiries.png",
  },
  {
    id: "invoices",
    tabLabel: "Invoicing",
    eyebrow: "Automated Billing",
    title: "Chasing payments, automated.",
    body: "Never send a manual follow-up again. Your agent tracks retainers, sends polite nudges, and handles payment scheduling securely.",
    cta: "See how it works",
    image: "/landing/invoicing.png",
  },
  {
    id: "timelines",
    tabLabel: "Timelines",
    eyebrow: "Day-of Logistics",
    title: "Flawless day-of logistics.",
    body: "Automatically generate and distribute wedding day timelines to planners, vendors, and the couple, keeping everyone perfectly in sync.",
    cta: "Explore logistics",
    image: "/landing/timelines.png",
  },
];

const TEXT_TRANSITION = { duration: 0.4, ease: "easeInOut" as const };
const IMG_TRANSITION = { duration: 0.5 };

export function FeatureCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = features[activeIndex];

  return (
    <section className="w-full bg-[#F5F5F0]">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-12 px-4 py-24 md:px-6 lg:grid-cols-[4fr_6fr] lg:gap-8">
        {/* Left — Editorial */}
        <div className="flex flex-col justify-center pr-0 lg:pr-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={TEXT_TRANSITION}
            >
              <div className="mb-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                <span className="block h-1.5 w-1.5 bg-slate-900" />
                {active.eyebrow}
              </div>

              <h3 className="mb-6 text-4xl font-light leading-[1.1] tracking-tight text-slate-900 lg:text-[44px]">
                {active.title}
              </h3>

              <p className="mb-10 max-w-md text-lg font-light leading-relaxed text-slate-500">
                {active.body}
              </p>

              <a
                href={`#${active.id}`}
                className="w-fit rounded-full border border-slate-200 bg-white px-8 py-3 text-sm font-medium text-slate-900 shadow-sm transition-all hover:shadow-md"
              >
                {active.cta}
              </a>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right — Media + Glass Nav */}
        <div className="relative aspect-square w-full max-h-[800px] overflow-hidden rounded-[2rem] rounded-br-md bg-neutral-100 md:aspect-[4/3] lg:aspect-[3/4]">
          <AnimatePresence>
            <motion.img
              key={active.id}
              src={active.image}
              alt={active.title}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={IMG_TRANSITION}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </AnimatePresence>

          {/* Glass pill nav */}
          <div className="absolute left-1/2 top-6 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/20 p-1.5 backdrop-blur-md">
            {features.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={`rounded-full px-5 py-2 text-sm font-medium transition-colors duration-300 ${
                  activeIndex === i
                    ? "bg-black/60 text-white shadow-lg"
                    : "text-white/70 hover:bg-black/40 hover:text-white"
                }`}
              >
                {f.tabLabel}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
