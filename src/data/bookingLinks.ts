export type BookingLink = {
  id: string;
  title: string;
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  url: string;
  description: string;
  active: boolean;
};

export const BOOKING_LINKS: BookingLink[] = [
  {
    id: "bl-1",
    title: "Initial Consultation",
    duration: 30,
    bufferBefore: 5,
    bufferAfter: 10,
    url: "https://app.atelier.studio/book/consultation",
    description: "First meeting with prospective couples to discuss their vision, logistics and pricing.",
    active: true,
  },
  {
    id: "bl-2",
    title: "Timeline Review",
    duration: 60,
    bufferBefore: 10,
    bufferAfter: 15,
    url: "https://app.atelier.studio/book/timeline-review",
    description: "Pre-wedding walkthrough of the shot list, day-of timeline and vendor coordination.",
    active: true,
  },
  {
    id: "bl-3",
    title: "Album Walkthrough",
    duration: 45,
    bufferBefore: 5,
    bufferAfter: 10,
    url: "https://app.atelier.studio/book/album-walkthrough",
    description: "Review album selections and spreads with the couple before sending to print.",
    active: true,
  },
  {
    id: "bl-4",
    title: "Quick Check-in",
    duration: 15,
    bufferBefore: 5,
    bufferAfter: 5,
    url: "https://app.atelier.studio/book/check-in",
    description: "Short catch-up call for updates, questions or last-minute changes.",
    active: false,
  },
];
