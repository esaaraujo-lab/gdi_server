"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // When a new SW takes over, reload once so the page uses the new assets
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "activated" &&
                navigator.serviceWorker.controller
              ) {
                // New SW activated — reload to get fresh content
                window.location.reload();
              }
            });
          });
        })
        .catch(() => {
          /* silencioso */
        });
    };
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
