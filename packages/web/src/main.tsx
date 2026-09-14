import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyAppIcon, loadAppIcon } from "./lib/appIcon";
import { armSounds } from "./lib/sounds";
import "./styles/app.css";

// The links in index.html point at the default set; a user who picked another
// one gets it applied here, before anything asks the document for an icon.
applyAppIcon(loadAppIcon());

// Listeners only — nothing is constructed until the user first touches the
// screen. iOS opens an audio device during a gesture or not at all, and the
// sounds this app plays mostly fire after a network round trip, by which time
// there is no gesture left to open it with.
armSounds();

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
