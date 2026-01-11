import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { BrowserRouter } from "react-router-dom";
import "./config/supabase"; // Initialize Supabase
import { startPeriodicSync, performFullSync } from "./services/syncService";

// Service worker is automatically registered by VitePWA plugin
// with registerType: "autoUpdate" in vite.config.ts

// Initialize sync service
const initializeSync = async () => {
  // Start periodic sync
  startPeriodicSync();
  
  // Perform initial sync if online (this will load tracks from Supabase)
  if (navigator.onLine) {
    try {
      await performFullSync();
      // Dispatch event to notify components that initial sync is done
      window.dispatchEvent(new CustomEvent('initial-sync-complete'));
    } catch (error) {
      // Still dispatch event so UI can try to load what's available
      window.dispatchEvent(new CustomEvent('initial-sync-complete'));
    }
  } else {
  }
};

// Initialize sync when DOM is ready
if (document.readyState === 'loading') {
  window.addEventListener('load', initializeSync);
} else {
  // DOM is already ready
  initializeSync();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.PROD ? '/' : '/concert-planner'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
