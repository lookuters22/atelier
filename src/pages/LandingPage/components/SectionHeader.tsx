import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function Highlight({ children }: { children: ReactNode }) {
  return (
    <motion.mark
      initial={{ backgroundPositionX: "100%" }}
      whileInView={{ backgroundPositionX: "0%" }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 2.5, delay: 1.0, ease: "easeInOut" }}
      className="inline-block px-1 transform-gpu will-change-transform"
      style={{
        backgroundImage:
          "linear-gradient(90deg, #0f172a 0%, #0f172a 35%, #ff8e3e 50%, #0f172a 65%, #0f172a 100%)",
        backgroundSize: "300% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      }}
    >
      {children}
    </motion.mark>
  );
}

interface SectionHeaderProps {
  title: ReactNode;
  className?: string;
}

export function SectionHeader({ title, className }: SectionHeaderProps) {
  return (
    <section className={`px-6 py-32 ${className || "bg-[#F5F5F0]"}`}>
      <motion.h2
        initial={{ opacity: 0, filter: "blur(6px)" }}
        whileInView={{ opacity: 1, filter: "blur(0px)" }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{
          opacity: { duration: 1.2, ease: [0.75, 0, 0.25, 1] },
          filter: { duration: 1.2, ease: [0.75, 0, 0.25, 1], delay: 0.2 },
        }}
        className="text-heading-2 font-weak mx-auto max-w-3xl text-center text-[#47201c] transform-gpu will-change-transform"
      >
        {title}
      </motion.h2>
    </section>
  );
}
