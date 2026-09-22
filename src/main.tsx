// Suppress benign Vite HMR WebSocket errors in AI Studio
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && (args[0].includes('[vite] failed to connect to websocket') || args[0].includes('WebSocket closed without opened'))) {
    return; // Ignore
  }
  originalError(...args);
};

window.addEventListener('unhandledrejection', (event) => {
  const reasonStr = String(event.reason?.message || event.reason || "");
  if (reasonStr.includes('WebSocket closed without opened') || reasonStr.includes('closed without opened')) {
    event.preventDefault();
    event.stopPropagation();
    console.warn("Benign WebSocket closure handled safely:", reasonStr);
  }
});

window.addEventListener('error', (event) => {
  const msg = String(event.message || event.error?.message || "");
  if (msg.includes('WebSocket closed without opened') || msg.includes('closed without opened')) {
    event.preventDefault();
    event.stopPropagation();
  }
});

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
