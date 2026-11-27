import { describe, it, expect } from "vitest";
import { landingUrl } from "../siteLinks";

describe("landingUrl", () => {
  it("drops the app. label, and uses the landing dev port locally", () => {
    expect(landingUrl({ protocol: "https:", hostname: "app.track.alfredo.re" })).toBe("https://track.alfredo.re");
    expect(landingUrl({ protocol: "https:", hostname: "app.staging.track.alfredo.re" })).toBe("https://staging.track.alfredo.re");
    expect(landingUrl({ protocol: "http:", hostname: "localhost" })).toBe("http://localhost:5174");
    expect(landingUrl({ protocol: "https:", hostname: "timetrack.example" })).toBe("https://timetrack.example");
  });
});
