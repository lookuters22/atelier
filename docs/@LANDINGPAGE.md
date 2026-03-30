# ATELIER OS: LANDING PAGE DESIGN & MOTION SYSTEM
This document defines the strict visual language, animation rules, and component architecture for the marketing site.

## 1. COMPONENT ARCHITECTURE (THE "ANTI-MONOLITH" RULE)
* **Strict Size Limit:** No component may exceed 150-200 lines. 
* **Shatter Pattern:** Complex sections (like the Hero) MUST be broken into smaller files. 
  * Example: `HeroWrapper` (scroll logic) -> `HeroStickyScene` (layout) -> `HeroBackgroundLayers` (images) + `HeroText` (content).
* Do NOT write massive monolithic HTML structures. 

## 2. COLOR PALETTE & TYPOGRAPHY
* **Background:** Deep Navy/Black (`bg-slate-950`).
* **Surface/Glass:** `bg-white/5 backdrop-blur-md border border-white/10`.
* **Text:** Pure White (`text-white`) for headings, Slate Gray (`text-slate-400`) for body.
* **Typography:** `font-sans`. Headings must be `font-bold tracking-tight`. 

## 3. HERO MOTION PHYSICS (Scroll-Linked Parallax)
The Hero section MUST use Framer Motion's `useScroll` and `useTransform`. It is a scroll-linked cinematic scene, not a `whileInView` reveal.
* **The Structure:** A tall outer container (e.g., `h-[300vh]`) to allow scrolling, with an inner container that is `sticky top-0 h-screen overflow-hidden`.
* **The Parallax Math (Y-Axis Translation):**
  * Background layer moves at `0.2x` speed (e.g., `[0, -100px]`).
  * Midground layer moves at `0.5x` speed (e.g., `[0, -220px]`).
  * Foreground layer moves at `0.8x` speed (e.g., `[0, -360px]`).
* **Opacity & Blur (Text):** * Entrance: `opacity: 0 -> 1`, `filter: blur(6px) -> blur(0)`.
  * Exit (as user scrolls past 50%): Fades out to let the 3D scene take over.
* **Easing:** Use smooth, editorial tweens. Do NOT use bouncy springs. Transition easing standard: `ease: [0.75, 0, 0.25, 1]`.