/**
 * Travel Tool — estimates travel costs for a destination wedding.
 *
 * Placeholder: returns a mock cost estimate.
 * Will be wired to the Amadeus API in a later phase.
 */

export type TravelToolParams = {
  destination: string;
};

export const estimateTravelCosts = {
  name: "estimate_travel_costs",
  description:
    "Estimates round-trip flight and hotel costs for the photographer to travel to a wedding destination.",
  parameters: {
    type: "object" as const,
    properties: {
      destination: {
        type: "string",
        description: "The wedding destination city or region (e.g. 'Lake Como, Italy').",
      },
    },
    required: ["destination"],
  },

  handler: async (params: TravelToolParams): Promise<string> => {
    return `Estimated round-trip flights and 2-night hotel stay for ${params.destination} is $1,500.`;
  },
};
