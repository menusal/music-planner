import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { BrowserRouter } from "react-router-dom";
import "./config/supabase"; // Initialize Supabase
import { startPeriodicSync, performFullSync } from "./services/syncService";

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/concert-planner/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
        
        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker is available
                window.dispatchEvent(new CustomEvent('sw-update-available', {
                  detail: registration
                }));
              }
            });
          }
        });
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Initialize sync service
window.addEventListener('load', () => {
  // Start periodic sync
  startPeriodicSync();
  
  // Perform initial sync if online
  if (navigator.onLine) {
    performFullSync().catch((error) => {
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
