import { initializePortalEffects } from "./utils/portalEffects";
import "./styles/portalEffects.css";

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import "./index.css";
import "./theme.css";
import "./styles/buttonAnimations.css";
import { enableButtonRipples } from "./utils/buttonRipple";
enableButtonRipples();
ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


initializePortalEffects();
