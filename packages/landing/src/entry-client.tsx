import React from "react";
import "./bufferPolyfill";
import ReactDOM from "react-dom/client";
import App from "./App";
import { resolve } from "./routes";
import "./index.css";

ReactDOM.hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <React.StrictMode>
    <App route={resolve(window.location.pathname).route} />
  </React.StrictMode>
);
