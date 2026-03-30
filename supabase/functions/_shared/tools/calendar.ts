/**
 * Calendar Tool — checks date availability for new inquiries.
 *
 * Placeholder: always returns "Date is available."
 * Will be wired to Google Calendar API in a later phase.
 */

export type CalendarToolParams = {
  date: string;
};

export const checkCalendarAvailability = {
  name: "check_calendar_availability",
  description:
    "Checks whether the photographer is available on a given date. Returns availability status.",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "The date to check in ISO 8601 or natural-language format (e.g. '2026-09-14' or 'September 14, 2026').",
      },
    },
    required: ["date"],
  },

  handler: async (_params: CalendarToolParams): Promise<string> => {
    return "Date is available.";
  },
};
