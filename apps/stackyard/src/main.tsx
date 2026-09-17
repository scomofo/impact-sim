import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Playground } from "@/components/playground/playground";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
