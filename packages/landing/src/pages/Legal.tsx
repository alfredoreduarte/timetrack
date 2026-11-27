import React from "react";
import ReactMarkdown from "react-markdown";
import Page from "./Page";
import type { LegalDoc } from "../routes";
import { site } from "../site";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = { children?: React.ReactNode; href?: string } & Record<string, any>;

const components = {
  h2: ({ children }: Props) => <h2 className="text-xl font-bold mt-10 mb-3 text-neon-green">{children}</h2>,
  p: ({ children }: Props) => <p className="mb-4 leading-relaxed text-gray-100/90">{children}</p>,
  ul: ({ children }: Props) => <ul className="mb-4 ml-5 list-disc space-y-2 text-gray-100/90">{children}</ul>,
  li: ({ children }: Props) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: Props) => <strong className="text-white">{children}</strong>,
  a: ({ children, href }: Props) => (
    <a href={href} className="text-neon-purple underline underline-offset-4 hover:text-white">
      {children}
    </a>
  ),
};

const Legal: React.FC<{ doc: LegalDoc }> = ({ doc }) => (
  <Page title={doc.title}>
    <p className="text-sm text-gray-400 mb-8">
      Last updated {doc.updated}
      {site.operator ? ` · ${site.name} is operated by ${site.operator}.` : ""}
    </p>
    <ReactMarkdown components={components}>{doc.body}</ReactMarkdown>
  </Page>
);

export default Legal;
