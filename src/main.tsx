import "@mittwald/flow-react-components/all.css";
import "./app.css";
import { IntlProvider } from "@mittwald/flow-react-components";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IntlProvider locale="de-DE">
      <App />
    </IntlProvider>
  </StrictMode>,
);
