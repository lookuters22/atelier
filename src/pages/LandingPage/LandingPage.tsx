import { useEffect } from "react";
import { Header } from "./components/Header";
import { HeroWrapper } from "./components/Hero/HeroWrapper";
import { ValueProposition } from "./components/ValueProposition";
import { FeatureGrid, FEATURE_GRID_IMAGE_SRCS } from "./components/FeatureGrid";
import { SectionHeader, Highlight } from "./components/SectionHeader";
import { HighlightSection } from "./components/HighlightSection";
import { FeatureCarousel } from "./components/FeatureCarousel";
import { Features3DCarousel } from "./components/Features3DCarousel";
import { FAQSection } from "./components/FAQSection";
import { Footer } from "./components/Footer";
import SmoothScrolling from "../../components/SmoothScrolling";

export function LandingPage() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const rootEl = document.getElementById("root");

    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    const prevBodyOverflow = body.style.overflowX;
    const prevRootBg = rootEl?.style.background ?? "";
    const wasLight = html.classList.contains("light");

    const darkBg = "#0a0a0f";
    html.style.background = darkBg;
    html.style.colorScheme = "dark";
    html.classList.remove("light");
    body.style.background = darkBg;
    body.style.overflowX = "hidden";
    if (rootEl) rootEl.style.background = darkBg;

    for (const src of FEATURE_GRID_IMAGE_SRCS) {
      const img = new Image();
      img.src = src;
    }

    return () => {
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
      body.style.overflowX = prevBodyOverflow;
      if (rootEl) rootEl.style.background = prevRootBg;
      if (wasLight) html.classList.add("light");
    };
  }, []);

  return (
    <SmoothScrolling>
    <div className="min-h-screen bg-slate-950 text-white">
      <Header />
      <HeroWrapper />
      <ValueProposition />
      <FeatureGrid />
      <SectionHeader
        title={
          <>
            Let autonomous intelligence conquer your{" "}
            <Highlight>administrative overhead.</Highlight>
          </>
        }
      />
      <HighlightSection />
      <FeatureCarousel />
      <Features3DCarousel />
      <SectionHeader
        className="bg-[#F3F1EB]"
        title={
          <>
            Your studio manager just got smarter.
            <br />
            <Highlight>Discover the latest capabilities.</Highlight>
          </>
        }
      />
      <FAQSection />
      <Footer />
    </div>
    </SmoothScrolling>
  );
}
