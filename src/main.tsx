import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import App from "./App";
import "./styles/global.css";

const appTheme = {
  ...webLightTheme,
  colorBrandForeground1: "#205C3B",
  colorBrandForeground2: "#39734F",
  colorBrandBackground: "#205C3B",
  colorBrandBackgroundHover: "#194C31",
  colorBrandBackgroundPressed: "#143E29",
  colorBrandStroke1: "#39734F",
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FluentProvider theme={appTheme}>
      <App />
    </FluentProvider>
  </StrictMode>,
);
