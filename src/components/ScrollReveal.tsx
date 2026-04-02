import { useEffect, useRef, useMemo, type ReactNode, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealProps {
  children: string;
  triggerRef: RefObject<HTMLDivElement | null>;
  enableBlur?: boolean;
  baseOpacity?: number;
  baseRotation?: number;
  blurStrength?: number;
  containerClassName?: string;
  textClassName?: string;
  startTrigger?: string;
  endTrigger?: string;
}

export function ScrollReveal({
  children,
  triggerRef,
  enableBlur = true,
  baseOpacity = 0.1,
  baseRotation = 3,
  blurStrength = 4,
  containerClassName = "",
  textClassName = "",
  startTrigger = "top bottom",
  endTrigger = "bottom bottom",
}: ScrollRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const splitText = useMemo(() => {
    const text = typeof children === "string" ? children : "";
    return text.split(/(\s+)/).map((word, index) => {
      if (word.match(/^\s+$/)) return word;
      return (
        <span className="inline-block word" key={index}>
          {word}
        </span>
      );
    });
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    const trigger = triggerRef.current;
    if (!el || !trigger) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { transformOrigin: "0% 50%", rotate: baseRotation },
        {
          ease: "none",
          rotate: 0,
          scrollTrigger: {
            trigger,
            start: startTrigger,
            end: endTrigger,
            scrub: true,
          },
        },
      );

      const wordElements = el.querySelectorAll<HTMLElement>(".word");

      gsap.fromTo(
        wordElements,
        { opacity: baseOpacity, willChange: "opacity" },
        {
          ease: "none",
          opacity: 1,
          stagger: 0.05,
          scrollTrigger: {
            trigger,
            start: startTrigger,
            end: endTrigger,
            scrub: true,
          },
        },
      );

      if (enableBlur) {
        gsap.fromTo(
          wordElements,
          { filter: `blur(${blurStrength}px)` },
          {
            ease: "none",
            filter: "blur(0px)",
            stagger: 0.05,
            scrollTrigger: {
              trigger,
              start: startTrigger,
              end: endTrigger,
              scrub: true,
            },
          },
        );
      }
    }, el);

    return () => ctx.revert();
  }, [triggerRef, enableBlur, baseRotation, baseOpacity, blurStrength, startTrigger, endTrigger]);

  return (
    <div ref={containerRef} className={containerClassName}>
      <span className={textClassName}>{splitText}</span>
    </div>
  );
}

interface ScrollRevealBlockProps {
  children: ReactNode;
  triggerRef: RefObject<HTMLDivElement | null>;
  enableBlur?: boolean;
  baseOpacity?: number;
  baseRotation?: number;
  blurStrength?: number;
  className?: string;
  startTrigger?: string;
  endTrigger?: string;
}

export function ScrollRevealBlock({
  children,
  triggerRef,
  enableBlur = true,
  baseOpacity = 0.1,
  baseRotation = 0,
  blurStrength = 4,
  className = "",
  startTrigger = "top bottom",
  endTrigger = "bottom bottom",
}: ScrollRevealBlockProps) {
  const elRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = elRef.current;
    const trigger = triggerRef.current;
    if (!el || !trigger) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        {
          opacity: baseOpacity,
          filter: enableBlur ? `blur(${blurStrength}px)` : "none",
          transformOrigin: "0% 50%",
          rotate: baseRotation,
        },
        {
          ease: "none",
          opacity: 1,
          filter: "blur(0px)",
          rotate: 0,
          scrollTrigger: {
            trigger,
            start: startTrigger,
            end: endTrigger,
            scrub: true,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [triggerRef, enableBlur, baseOpacity, baseRotation, blurStrength, startTrigger, endTrigger]);

  return (
    <span ref={elRef} className={`inline-block ${className}`}>
      {children}
    </span>
  );
}
