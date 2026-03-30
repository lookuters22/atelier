import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    id: "1",
    question: "Does it reply as me or as an AI assistant?",
    answer:
      "Your agent acts as your studio manager. It uses your exact brand voice, tone, and sign-offs. Clients feel like they are talking to a dedicated administrative team member, not a robot.",
  },
  {
    id: "2",
    question: "How does it handle custom quotes and pricing?",
    answer:
      "During setup, you input your pricing logic, travel fees, and add-ons. When a lead asks for a quote, the agent calculates the exact cost based on their venue, date, and requested coverage, generating a beautiful, accurate proposal instantly.",
  },
  {
    id: "3",
    question: "Can it accidentally double-book my calendar?",
    answer:
      "Never. The agent maintains a live, two-way sync with your Google Calendar, Apple Calendar, or CRM. If a date is blocked or pending, it will politely inform the client you are unavailable and offer alternative dates or associate shooters.",
  },
  {
    id: "4",
    question: "What happens if a client asks a question it doesn't know?",
    answer:
      "If an inquiry falls outside your predefined parameters or requires a nuanced artistic answer, the agent gracefully pauses the conversation, notifies you via push notification, and drafts a suggested response for you to review and send.",
  },
];

const EASE = [0.75, 0, 0.25, 1] as const;

export function FAQSection() {
  const [openId, setOpenId] = useState<string | null>("1");

  return (
    <section className="w-full bg-[#F5F5F0] px-4 py-24 md:px-6">
      <div className="mx-auto flex max-w-[1000px] flex-col items-center rounded-[3rem] rounded-br-md bg-gradient-to-b from-slate-900/[0.03] to-slate-900/[0.01] px-4 py-16 md:py-24">
        <h2 className="mb-12 text-4xl font-light tracking-tight text-slate-900 md:text-5xl">
          FAQs
        </h2>

        <div className="flex w-full max-w-[830px] flex-col gap-4">
          {faqs.map((faq) => {
            const isOpen = openId === faq.id;

            return (
              <div key={faq.id}>
                <motion.button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : faq.id)}
                  initial={false}
                  animate={{
                    borderBottomLeftRadius: isOpen ? "0px" : "32px",
                    borderBottomRightRadius: isOpen ? "0px" : "32px",
                    borderTopLeftRadius: "32px",
                    borderTopRightRadius: "32px",
                  }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="relative z-10 flex w-full items-center justify-between border border-slate-900/5 bg-white p-5 text-left shadow-[0_6px_12px_rgba(0,0,0,0.04)] outline-none hover:bg-white/90 md:px-8 md:py-6"
                >
                  <span className="pr-4 font-medium text-slate-900">
                    {faq.question}
                  </span>
                  <motion.div
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-900/5 bg-white text-slate-400 shadow-sm"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </motion.div>
                </motion.button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-b-[32px] border-x border-b border-slate-900/5 bg-slate-900/5 p-6 text-sm font-light leading-relaxed text-slate-600 md:px-8 md:py-7 md:text-base">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
