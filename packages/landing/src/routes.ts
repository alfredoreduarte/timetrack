import matter from "gray-matter";
import termsMd from "../content/legal/terms.md?raw";
import privacyMd from "../content/legal/privacy.md?raw";
import refundsMd from "../content/legal/refunds.md?raw";
import { site } from "./site";

export interface LegalDoc {
  title: string;
  description: string;
  updated: string;
  body: string;
}

const legal = (raw: string): LegalDoc => {
  const { data, content } = matter(raw);
  return {
    title: data.title as string,
    description: data.description as string,
    updated: data.updated as string,
    body: content,
  };
};

export const legalDocs: Record<string, LegalDoc> = {
  "/terms": legal(termsMd),
  "/privacy": legal(privacyMd),
  "/refunds": legal(refundsMd),
};

export type Route =
  | { kind: "home" }
  | { kind: "legal"; doc: LegalDoc }
  | { kind: "support" }
  | { kind: "notFound" };

export interface Head {
  title: string;
  description: string;
  /** Path for the canonical link and social cards (null: not indexed). */
  path: string | null;
}

const HOME_DESCRIPTION =
  "Every Claude Code session gets its own timer. Quiet sessions pause at their last activity, parallel agents are billed honestly, and the timesheet is ready for your client.";

/** Which page a URL shows, and its head tags. Query strings and trailing slashes are ignored. */
export function resolve(url: string): { route: Route; head: Head; status: number } {
  const path = (url.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  if (path === "/") {
    return {
      route: { kind: "home" },
      head: { title: `${site.name} — Billable hours for parallel AI agents`, description: HOME_DESCRIPTION, path: "/" },
      status: 200,
    };
  }
  const doc = legalDocs[path];
  if (doc) {
    return {
      route: { kind: "legal", doc },
      head: { title: `${doc.title} — ${site.name}`, description: doc.description, path },
      status: 200,
    };
  }
  if (path === "/support") {
    return {
      route: { kind: "support" },
      head: {
        title: `Support — ${site.name}`,
        description: `How to reach ${site.name} for help, billing and privacy requests.`,
        path,
      },
      status: 200,
    };
  }
  return {
    route: { kind: "notFound" },
    head: { title: `Page not found — ${site.name}`, description: HOME_DESCRIPTION, path: null },
    status: 404,
  };
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The <head> tags for a page: title, description, canonical link and social cards. */
export function headTags(head: Head): string {
  const tags = [
    `<title>${escape(head.title)}</title>`,
    `<meta name="description" content="${escape(head.description)}" />`,
  ];
  if (head.path === null) {
    tags.push(`<meta name="robots" content="noindex" />`);
    return tags.join("\n    ");
  }
  const url = `${site.url}${head.path === "/" ? "/" : head.path}`;
  tags.push(
    `<link rel="canonical" href="${escape(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escape(site.name)}" />`,
    `<meta property="og:title" content="${escape(head.title)}" />`,
    `<meta property="og:description" content="${escape(head.description)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    `<meta property="og:image" content="${escape(`${site.url}/og.png`)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(head.title)}" />`,
    `<meta name="twitter:description" content="${escape(head.description)}" />`,
    `<meta name="twitter:image" content="${escape(`${site.url}/og.png`)}" />`
  );
  return tags.join("\n    ");
}
