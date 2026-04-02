import { useRef, useEffect } from "react";
import { useInView } from "framer-motion";

type CardProps = {
  imageSrc?: string;
  videoSrc?: string;
  title: string;
  body: string;
};

function ImmersiveCard({ imageSrc, videoSrc, title, body }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideoInView = useInView(ref, { margin: "-100px" });

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isVideoInView) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [isVideoInView]);

  return (
    <div
      ref={ref}
      className="group relative aspect-[3/4] max-h-[calc(100svh-120px)] w-full overflow-hidden rounded-[2rem] rounded-br-md bg-[#141210]"
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
        <img
          src={imageSrc!}
          alt={title}
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />

      <div className="absolute bottom-0 left-0 flex w-full flex-col justify-end p-8 md:p-12">
        <h3 className="text-heading-3 font-weak mb-3 text-white">
          {title}
        </h3>
        <p className="text-body-small font-weak max-w-md text-white/70">
          {body}
        </p>
      </div>
    </div>
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

export const FEATURE_GRID_IMAGE_SRCS = [
  "/landing/feature-artist.webp",
  "/landing/feature-manager.webp",
] as const;

export function FeatureGrid() {
  return (
    <section className="bg-[#1C1917] py-24">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-4 md:grid-cols-2 md:gap-6 md:px-6">
        {CARDS.map((card) => (
          <ImmersiveCard key={card.title} {...card} />
        ))}
      </div>
    </section>
  );
}
