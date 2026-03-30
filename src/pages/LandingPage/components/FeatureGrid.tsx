import { useState, useRef, useEffect } from "react";
import { motion, useInView } from "framer-motion";

function FadeInImage({ src, alt }: { src: string; alt: string }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <>
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-neutral-800" />
      )}
      <motion.img
        src={src}
        alt={alt}
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: isLoaded ? 1 : 0, scale: isLoaded ? 1 : 1.04 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        onLoad={() => setIsLoaded(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </>
  );
}

type CardProps = {
  imageSrc?: string;
  videoSrc?: string;
  title: string;
  body: string;
  index?: number;
};

function ImmersiveCard({ imageSrc, videoSrc, title, body, index = 0 }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isInView = useInView(ref, { margin: "-100px" });

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isInView) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [isInView]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: index * 0.15 }}
      viewport={{ once: true, margin: "-50px" }}
      className="group relative aspect-[3/4] max-h-[calc(100svh-120px)] w-full overflow-hidden rounded-[2rem] rounded-br-md bg-neutral-900"
    >
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <FadeInImage src={imageSrc!} alt={title} />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />

      <div className="absolute bottom-0 left-0 flex w-full flex-col justify-end p-8 md:p-12">
        <h3 className="mb-3 text-2xl font-medium tracking-tight text-white md:text-3xl">
          {title}
        </h3>
        <p className="max-w-md text-base font-light leading-relaxed text-white/70 md:text-lg">
          {body}
        </p>
      </div>
    </motion.div>
  );
}

const CARDS: CardProps[] = [
  {
    imageSrc: "/landing/feature-artist.webp",
    title: "Stay in the moment.",
    body: "Your AI agent handles the frantic emails and pricing inquiries, so you can stay fully present behind the lens.",
  },
  {
    imageSrc: "/landing/feature-manager.webp",
    title: "More personalized than a template.",
    body: "The system learns your distinct brand voice, turning cold inquiries into booked consultations with tailored, human-like responses.",
  },
];

export function FeatureGrid() {
  return (
    <section className="bg-[#1C1917] py-24">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-4 md:grid-cols-2 md:gap-6 md:px-6">
        {CARDS.map((card, i) => (
          <ImmersiveCard key={card.title} {...card} index={i} />
        ))}
      </div>
    </section>
  );
}
