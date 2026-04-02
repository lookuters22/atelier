import { useCalendarMode } from "./CalendarModeContext";
import { CalendarScheduleGrid } from "./CalendarScheduleGrid";
import { BookingLinksTable } from "./BookingLinksTable";
import { TravelBlockedView } from "./TravelBlockedView";

export function CalendarGrid() {
  const { activeNav } = useCalendarMode();

  switch (activeNav) {
    case "schedule":
      return <CalendarScheduleGrid />;
    case "booking-links":
      return <BookingLinksTable />;
    case "travel":
      return <TravelBlockedView />;
    default:
      return <CalendarScheduleGrid />;
  }
}
