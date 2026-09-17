import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Simulator } from "@/components/sim/simulator";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Simulator />
  </StrictMode>,
);
