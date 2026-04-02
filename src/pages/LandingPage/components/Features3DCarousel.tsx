import { useEffect, useRef } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

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

const CARD_COUNT = carouselItems.length;

function SmoothCard({
  item,
  index,
  dragX,
  vw,
}: {
  item: (typeof carouselItems)[number];
  index: number;
  dragX: MotionValue<number>;
  vw: MotionValue<number>;
}) {
  const offset = useTransform(dragX, (v) => {
    const raw = v + index;
    const wrapped = ((raw % CARD_COUNT) + CARD_COUNT) % CARD_COUNT;
    return wrapped > CARD_COUNT / 2 ? wrapped - CARD_COUNT : wrapped;
  });

  const x = useTransform([offset, vw], ([o, viewportWidth]) => {
    const ao = Math.abs(o as number);
    if (ao < 0.001) return 0;
    const sign = (o as number) > 0 ? 1 : -1;
    const halfVw = (viewportWidth as number) / 2;
    if (ao <= 1) return sign * ao * halfVw;
    if (ao <= 2) return sign * halfVw * (1 + (ao - 1) * 0.8);
    return sign * halfVw * 1.8;
  });

  const rotateY = useTransform(offset, (o) => {
    const ao = Math.abs(o);
    const sign = o > 0 ? 1 : -1;
    if (ao < 0.001) return 0;
    if (ao <= 1) return -sign * ao * 45;
    return -sign * 45;
  });

  const rotateX = useTransform(offset, (o) => {
    const ao = Math.abs(o);
    if (ao < 0.001) return 0;
    if (ao <= 1) return ao * 4;
    return 4;
  });

  const rotateZ = useTransform(offset, (o) => {
    const ao = Math.abs(o);
    const sign = o > 0 ? 1 : -1;
    if (ao < 0.001) return 0;
    if (ao <= 1) return sign * ao * 1.5;
    return sign * 1.5;
  });

  const z = useTransform(offset, (o) => {
    const ao = Math.abs(o);
    if (ao < 0.001) return 0;
    if (ao <= 1) return -ao * 120;
    return -120;
  });

  const scale = useTransform(offset, (o) => {
    const ao = Math.abs(o);
    if (ao < 0.001) return 1;
    if (ao <= 1) return 1 + 0.1 * ao;
    if (ao <= 2) return 1.1 - 0.3 * (ao - 1);
    return 0.8;
  });

  const zIndex = useTransform(offset, (o) => {
    const ao = Math.abs(o);
    if (ao < 0.5) return 20;
    if (ao < 1.5) return 10;
    return 0;
  });

  const opacity = useTransform(offset, (o) => {
    const ao = Math.abs(o);
    if (ao <= 1) return 1;
    if (ao <= 2) return 1 - (ao - 1);
    return 0;
  });

  const textOpacity = useTransform(offset, (o) => {
    const ao = Math.abs(o);
    return ao < 0.4 ? Math.max(0, 1 - ao * 2.5) : 0;
  });

  return (
    <motion.div
      style={{
        x,
        rotateY,
        rotateX,
        rotateZ,
        z,
        scale,
        zIndex,
        opacity,
        transformStyle: "preserve-3d",
      }}
      className="absolute h-[300px] w-[300px] overflow-hidden rounded-[2rem] shadow-2xl will-change-transform md:h-[450px] md:w-[450px]"
    >
      <img
        src={item.image}
        alt={item.title}
        decoding="sync"
        loading="eager"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <motion.div
        style={{ opacity: textOpacity }}
        className="absolute bottom-0 left-0 p-8"
      >
        <h3 className="text-heading-4 font-weak mb-2 text-white">
          {item.title}
        </h3>
        <p className="text-body-tiny font-weak text-white/80">
          {item.body}
        </p>
      </motion.div>
    </motion.div>
  );
}

function CarouselTrack() {
  const trackRef = useRef<HTMLDivElement>(null);
  const hasEnteredView = useInView(trackRef, { once: true, amount: 0.15 });

  const vw = useMotionValue(typeof window !== "undefined" ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => { vw.set(window.innerWidth); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [vw]);

  const rawIndex = useMotionValue(-1);
  const activeIndex = useSpring(rawIndex, { stiffness: 120, damping: 40, bounce: 0 });
  const dragStart = useRef(0);

  return (
    <motion.div
      ref={trackRef}
      initial={{ opacity: 0, y: 50 }}
      animate={hasEnteredView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={
        hasEnteredView
          ? { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }
          : { duration: 0 }
      }
      className="relative z-20 mt-12 flex h-[400px] w-full items-center justify-center md:h-[500px]"
      style={{ perspective: "2000px", transformStyle: "preserve-3d" }}
    >
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        dragTransition={{
          power: 0.3,
          timeConstant: 200,
          modifyTarget: () => 0,
        }}
        onDragStart={() => {
          dragStart.current = rawIndex.get();
        }}
        onDrag={(_e, info) => {
          const shift = info.offset.x / 250;
          rawIndex.set(dragStart.current + shift);
        }}
        onDragEnd={(_e, info) => {
          const shift = info.offset.x / 250;
          const snapped = Math.round(dragStart.current + shift);
          rawIndex.set(snapped);
        }}
        className="absolute inset-0 z-30 cursor-grab active:cursor-grabbing"
      />

      {carouselItems.map((item, index) => (
        <SmoothCard
          key={item.id}
          item={item}
          index={index}
          dragX={activeIndex}
          vw={vw}
        />
      ))}
    </motion.div>
  );
}

export function Features3DCarousel() {
  return (
    <section className="relative flex min-h-screen w-full flex-col items-center overflow-hidden py-32">
      <video
        autoPlay
        muted
        loop
        playsInline
        poster="https://image.mux.com/68rJKpWeh8q02zZFcXmcCWjfGbJoHH8xx/thumbnail.jpg?time=0"
        src="https://stream.mux.com/68rJKpWeh8q02zZFcXmcCWjfGbJoHH8xx/high.mp4"
        className="absolute inset-0 z-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-transparent via-[#ffb883]/40 to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-mono-tiny relative z-20 mb-8 flex items-center gap-2 self-start text-[#47201c] md:ml-[10%] transform-gpu will-change-transform"
      >
        <span className="block h-1.5 w-1.5 bg-[#47201c]" />
        Atelier Features
      </motion.div>

      <CarouselTrack />
    </section>
  );
}
