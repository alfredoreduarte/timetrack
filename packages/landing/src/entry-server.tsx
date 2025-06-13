import React from "react";
import { renderToString } from "react-dom/server";
import App from "./App";

export function render() {
  return renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
