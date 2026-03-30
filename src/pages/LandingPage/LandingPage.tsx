import { HeroWrapper } from "./components/Hero/HeroWrapper";
import { ValueProposition } from "./components/ValueProposition";
import { FeatureGrid } from "./components/FeatureGrid";
import { SectionHeader, Highlight } from "./components/SectionHeader";
import { HighlightSection } from "./components/HighlightSection";
import { FeatureCarousel } from "./components/FeatureCarousel";
import { Features3DCarousel } from "./components/Features3DCarousel";
import { FAQSection } from "./components/FAQSection";
import { Footer } from "./components/Footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
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
  );
}
