import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./playground.css";

import { installDebugTrap } from "./debugTrap";

installDebugTrap();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
