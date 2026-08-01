import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyAppIcon, loadAppIcon } from "./lib/appIcon";
import "./styles/app.css";

// The links in index.html point at the default set; a user who picked another
// one gets it applied here, before anything asks the document for an icon.
applyAppIcon(loadAppIcon());

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
