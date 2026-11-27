import React from "react";
import "./bufferPolyfill";
import ReactDOM from "react-dom/client";
import App from "./App";
import { resolve } from "./routes";
// Self-hosted, so no page view reaches a third-party font server.
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./index.css";

ReactDOM.hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <React.StrictMode>
    <App route={resolve(window.location.pathname).route} />
  </React.StrictMode>
);
