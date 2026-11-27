import { describe, it, expect } from "vitest";
import { resolve, headTags } from "../routes";
import { site } from "../site";

describe("resolve", () => {
  it("maps each page, ignoring query strings and trailing slashes", () => {
    expect(resolve("/").route.kind).toBe("home");
    expect(resolve("/?utm_source=news.ycombinator.com").route.kind).toBe("home");
    for (const path of ["/terms", "/privacy", "/refunds"]) {
      const page = resolve(path);
      expect(page.route.kind).toBe("legal");
      expect(page.status).toBe(200);
      expect(page.head.path).toBe(path);
    }
    expect(resolve("/terms/").head.path).toBe("/terms");
    expect(resolve("/privacy?ref=a.b").route.kind).toBe("legal");
    expect(resolve("/support").route.kind).toBe("support");
  });

  it("answers anything else with a 404 page that isn't indexed", () => {
    const missing = resolve("/no/such/page");
    expect(missing.status).toBe(404);
    expect(missing.route.kind).toBe("notFound");
    expect(missing.head.path).toBeNull();
  });

  it("handles a very long path quickly", () => {
    const started = Date.now();
    expect(resolve("/".repeat(16000) + "a").status).toBe(404);
    expect(resolve("/a" + "/".repeat(16000)).status).toBe(404);
    expect(Date.now() - started).toBeLessThan(50);
  });
});

describe("headTags", () => {
  it("gives indexed pages a canonical link and social cards", () => {
    const tags = headTags(resolve("/terms").head);
    expect(tags).toContain(`<link rel="canonical" href="${site.url}/terms" />`);
    expect(tags).toContain(`<meta property="og:image" content="${site.url}/og.png" />`);
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(tags).not.toContain("noindex");
  });

  it("keeps the 404 page out of search results", () => {
    const tags = headTags(resolve("/nope").head);
    expect(tags).toContain('<meta name="robots" content="noindex" />');
    expect(tags).not.toContain("canonical");
  });

  it("escapes text that could break out of an attribute or tag", () => {
    const tags = headTags({ title: `A "quoted" <b>&</b>`, description: `x" onload="y`, path: "/" });
    expect(tags).toContain("<title>A &quot;quoted&quot; &lt;b&gt;&amp;&lt;/b&gt;</title>");
    expect(tags).toContain('content="x&quot; onload=&quot;y"');
    expect(tags).not.toContain("<b>");
  });
});
