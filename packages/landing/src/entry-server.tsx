import React from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
import { resolve, headTags } from "./routes";

/** The page for a URL: its HTML, its <head> tags and the HTTP status. */
export function render(url: string) {
  const { route, head, status } = resolve(url);
  const html = renderToString(
    <React.StrictMode>
      <App route={route} />
    </React.StrictMode>
  );
  return { html, head: headTags(head), status };
}
