import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { WalletProvider } from "./lib/wallet";
import "./styles.css";
import "./landing.css";
import "./app-polish.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </StrictMode>,
);
