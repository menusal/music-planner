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
window.addEventListener('load', () => {
  // Start periodic sync
  startPeriodicSync();
  
  // Perform initial sync if online (this will load tracks from Supabase)
  if (navigator.onLine) {
    performFullSync()
      .then(() => {
        console.log('Initial sync completed');
        // Dispatch event to notify components that initial sync is done
        window.dispatchEvent(new CustomEvent('initial-sync-complete'));
      })
      .catch((error) => {
        console.error('Error in initial sync:', error);
      });
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/concert-planner">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
