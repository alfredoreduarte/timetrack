import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server, apiPath } from "../../test/mocks/server";
import { projectsAPI } from "../api";

describe("a 401 from the API", () => {
  it("forgets the token and the profile, as signing out does", async () => {
    localStorage.setItem("token", "expired");
    localStorage.setItem("user", JSON.stringify({ id: "u1", email: "ada@dev.test" }));
    server.use(http.get(apiPath("/projects"), () => HttpResponse.json({ error: "User not found" }, { status: 401 })));
    await expect(projectsAPI.getProjects()).rejects.toBeTruthy();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });
});
