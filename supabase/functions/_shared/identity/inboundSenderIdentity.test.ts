import { describe, expect, it } from "vitest";
import {
  buildInboundSenderIdentityFromIngress,
  deriveRegistrableDomainFromEmail,
  extractBareEmailFromIngress,
} from "./inboundSenderIdentity.ts";

describe("inboundSenderIdentity", () => {
  it("extractBareEmailFromIngress parses angle-bracket form", () => {
    expect(extractBareEmailFromIngress("Erin <erin@indalo.travel>")).toBe("erin@indalo.travel");
  });

  it("deriveRegistrableDomainFromEmail returns host for bare email", () => {
    expect(deriveRegistrableDomainFromEmail("erin@indalo.travel")).toBe("indalo.travel");
  });

  it("buildInboundSenderIdentityFromIngress derives email + domain", () => {
    const id = buildInboundSenderIdentityFromIngress({
      inboundSenderEmail: "Erin <erin@indalo.travel>",
      inboundSenderDisplayName: null,
    });
    expect(id).not.toBeNull();
    expect(id?.email).toBe("erin@indalo.travel");
    expect(id?.domain).toBe("indalo.travel");
  });
});
