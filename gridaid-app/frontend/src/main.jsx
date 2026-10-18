import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/oxanium";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/stage.css";
import "./styles/planner.css";
import "./styles/sections.css";
import "./styles/intro.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
