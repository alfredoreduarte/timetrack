import { describe, it, expect } from "vitest";
import { landingUrl } from "../siteLinks";

describe("landingUrl", () => {
  it("drops the app. label, and finds the local landing for each dev setup", () => {
    expect(landingUrl({ protocol: "https:", hostname: "app.track.alfredo.re", port: "" })).toBe("https://track.alfredo.re");
    expect(landingUrl({ protocol: "https:", hostname: "app.staging.track.alfredo.re", port: "" })).toBe("https://staging.track.alfredo.re");
    expect(landingUrl({ protocol: "http:", hostname: "localhost", port: "5173" })).toBe("http://localhost:5174");
    expect(landingUrl({ protocol: "http:", hostname: "localhost", port: "3010" })).toBe("http://localhost:3014");
    expect(landingUrl({ protocol: "https:", hostname: "timetrack.example", port: "" })).toBe("https://timetrack.example");
  });
});
