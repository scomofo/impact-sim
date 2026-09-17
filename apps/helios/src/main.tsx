import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { HeliosApp } from "@/components/helios-app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HeliosApp />
  </StrictMode>,
);
