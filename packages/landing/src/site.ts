import matter from "gray-matter";
import siteMd from "../content/site.md?raw";

const { data } = matter(siteMd);

/** Site-wide settings from content/site.md. */
export const site = {
  name: (data.name as string) || "Trackr",
  url: ((data.url as string) || "").replace(/\/$/, ""),
  operator: (data.operator as string) || "",
  supportEmail: (data.supportEmail as string) || "",
  githubIssues: (data.githubIssues as string) || "",
};
