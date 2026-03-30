import { useState, useRef } from "react";
import { motion, useInView } from "framer-motion";

const carouselItems = [
  {
    id: "1",
    title: "24/7, 365 booking.",
    body: "Your AI agent never sleeps. Capture leads and send quotes at 2 AM while you rest.",
    image: "/landing/slider1.webp",
  },
  {
    id: "2",
    title: "No corporate-speak.",
    body: "Unlike generic bots, Atelier learns your exact tone of voice. Talk to your clients like a human.",
    image: "/landing/slider2.webp",
  },
  {
    id: "3",
    title: "Real-time timeline syncing.",
    body: "When a client changes a detail, your entire logistics board updates instantly.",
    image: "/landing/slider3.webp",
  },
  {
    id: "4",
    title: "Vendor coordination.",
    body: "Automatically ping florists and planners with updated arrival times.",
    image: "/landing/slider4.webp",
  },
];

const SPRING = { type: "spring" as const, stiffness: 300, damping: 28 };

function FadeInImage({ src, alt }: { src: string; alt: string }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <>
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-slate-200/20" />
      )}
      <motion.img
        src={src}
        alt={alt}
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: isLoaded ? 1 : 0, scale: isLoaded ? 1 : 1.05 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        onLoad={() => setIsLoaded(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </>
  );
}

function getTransform(offset: number) {
  if (offset === 0)
    return { x: "0%", rotateY: 0, scale: 1, zIndex: 20, opacity: 1 };
  if (offset === -1)
    return { x: "-160%", rotateY: 45, scale: 1.1, zIndex: 10, opacity: 0.6 };
  if (offset === 1)
    return { x: "160%", rotateY: -45, scale: 1.1, zIndex: 10, opacity: 0.6 };
  return {
    x: offset > 0 ? "300%" : "-300%",
    rotateY: offset > 0 ? -45 : 45,
    scale: 0.8,
    zIndex: 0,
    opacity: 0,
  };
}

function CarouselTrack({
  activeIndex,
  setActiveIndex,
}: {
  activeIndex: number;
  setActiveIndex: (i: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hasEnteredView = useInView(trackRef, { once: true, amount: 0.15 });

  return (
    <div
      ref={trackRef}
      className="relative z-20 mt-12 flex h-[400px] w-full max-w-[1200px] items-center justify-center md:h-[500px]"
      style={{ perspective: "2000px", transformStyle: "preserve-3d" }}
    >
      {carouselItems.map((item, index) => {
        const offset = index - activeIndex;
        const { x, rotateY, scale, zIndex, opacity } = getTransform(offset);

        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 60 }}
            animate={
              hasEnteredView
                ? { x, rotateY, scale, opacity, zIndex, y: 0 }
                : { opacity: 0, y: 60 }
            }
            transition={
              hasEnteredView
                ? { ...SPRING, delay: index * 0.1 }
                : { duration: 0 }
            }
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_e, dragInfo) => {
              if (
                dragInfo.offset.x < -30 &&
                activeIndex < carouselItems.length - 1
              ) {
                setActiveIndex(activeIndex + 1);
              } else if (dragInfo.offset.x > 30 && activeIndex > 0) {
                setActiveIndex(activeIndex - 1);
              }
            }}
            onClick={() => setActiveIndex(index)}
            style={{
              transformStyle: "preserve-3d",
              backfaceVisibility: "hidden",
            }}
            className="absolute h-[300px] w-[300px] origin-center cursor-grab overflow-hidden rounded-[2rem] shadow-2xl active:cursor-grabbing md:h-[450px] md:w-[450px]"
          >
            <FadeInImage src={item.image} alt={item.title} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <motion.div
              animate={{ opacity: offset === 0 ? 1 : 0 }}
              transition={{ duration: 0.3 }}
              className="absolute bottom-0 left-0 p-8"
            >
              <h3 className="mb-2 text-2xl font-medium text-white">
                {item.title}
              </h3>
              <p className="text-sm font-light leading-relaxed text-white/80">
                {item.body}
              </p>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function Features3DCarousel() {
  const [activeIndex, setActiveIndex] = useState(1);

  return (
    <section className="relative flex min-h-screen w-full flex-col items-center overflow-hidden py-32">
      {/* Layer 1 — Background video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        poster="https://image.mux.com/68rJKpWeh8q02zZFcXmcCWjfGbJoHH8xx/thumbnail.jpg?time=0"
        src="https://stream.mux.com/68rJKpWeh8q02zZFcXmcCWjfGbJoHH8xx/high.mp4"
        className="absolute inset-0 z-0 h-full w-full object-cover"
      />

      {/* Layer 2 — Peach gradient wash */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-transparent via-[#ffb883]/40 to-transparent" />

      {/* Eyebrow */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-20 mb-8 flex items-center gap-2 self-start font-mono text-xs uppercase tracking-widest text-slate-900 md:ml-[10%]"
      >
        <span className="block h-1.5 w-1.5 bg-slate-900" />
        Atelier Features
      </motion.div>

      {/* 3D Carousel track */}
      <CarouselTrack activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
    </section>
  );
}
