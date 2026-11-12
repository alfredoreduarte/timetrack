import { normalizeGitRemote } from "../git";

describe("normalizeGitRemote", () => {
  it.each([
    ["git@github.com:Acme/Web.git", "github.com/acme/web"],
    ["https://github.com/acme/web.git", "github.com/acme/web"],
    ["https://github.com/acme/web", "github.com/acme/web"],
    ["https://x-access-token:ghp_secret@github.com/acme/web.git", "github.com/acme/web"],
    ["ssh://git@gitlab.com:2222/group/sub/repo.git", "gitlab.com/group/sub/repo"],
    ["git://example.org/a/b.git/", "example.org/a/b"],
    ["  git@bitbucket.org:team/repo.git\n", "bitbucket.org/team/repo"],
    ["github.com/acme/web", "github.com/acme/web"],
    ["GitHub.com/Acme/Web.git", "github.com/acme/web"],
    // URL semantics resolve dot segments; the result is just a lookup key.
    ["https://github.com/a/../acme/web", "github.com/acme/web"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeGitRemote(input)).toBe(expected);
  });

  it.each([
    [""],
    ["not a url"],
    ["/Users/me/code/repo"],
    ["file:///Users/me/repo.git"],
    ["https://github.com/"],
    [null],
    [undefined],
  ])("rejects %p", (input) => {
    expect(normalizeGitRemote(input as string)).toBeNull();
  });

  it("is idempotent", () => {
    for (const raw of ["git@github.com:Acme/Web.git", "https://tok@gitlab.com/g/s/r.git"]) {
      const once = normalizeGitRemote(raw);
      expect(normalizeGitRemote(once)).toBe(once);
    }
  });

  it("never keeps credentials", () => {
    const out = normalizeGitRemote("https://user:supersecret@git.example.com/org/repo.git");
    expect(out).toBe("git.example.com/org/repo");
    expect(out).not.toContain("supersecret");
  });
});
