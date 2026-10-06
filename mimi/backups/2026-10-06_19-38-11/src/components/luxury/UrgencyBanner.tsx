"use client";

import { useEffect, useState } from "react";
import { Flame, X } from "lucide-react";
import { useContentStore } from "@/lib/content-store";

/**
 * UrgencyBanner — floating banner showing a countdown timer.
 *
 * Reads config from content store:
 *  - urgencyTimerEnabled (bool)
 *  - urgencyTimerHours (number — duration of countdown in hours)
 *
 * Dismiss persists to sessionStorage (so it doesn't reappear in the same session).
 * Countdown is anchored to the current session start time (in-memory) so it
 * counts down from "now + urgencyTimerHours" each new session.
 *
 * The countdown ticks every second. Progress bar at bottom reflects the
 * percentage of time elapsed.
 */

const DISMISS_KEY = "mimi-urgency-dismissed";
const START_KEY = "mimi-urgency-start";

function getStartTime(): number {
  if (typeof window === "undefined") return Date.now();
  const existing = sessionStorage.getItem(START_KEY);
  if (existing) {
    const n = Number(existing);
    if (!Number.isNaN(n)) return n;
  }
  const now = Date.now();
  sessionStorage.setItem(START_KEY, String(now));
  return now;
}

function isInitiallyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(sessionStorage.getItem(DISMISS_KEY));
}

function formatTime(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function UrgencyBanner() {
  const enabled = useContentStore((s) => s.urgencyTimerEnabled);
  const hours = useContentStore((s) => s.urgencyTimerHours);

  // Use lazy initializer for client-only state to avoid setState-in-effect.
  const [dismissed, setDismissed] = useState(isInitiallyDismissed);
  const [remaining, setRemaining] = useState(0);

  // `total` is derived directly from `hours` (no state needed).
  const total = Math.max(1, Math.round(hours * 3600));

  // Start countdown when banner becomes active
  useEffect(() => {
    if (!enabled || dismissed) return;
    const start = getStartTime();

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const left = total - elapsed;
      if (left <= 0) {
        setRemaining(0);
        // Reset start time so the timer restarts when reaching zero (recurring urgency)
        sessionStorage.setItem(START_KEY, String(Date.now()));
      } else {
        setRemaining(left);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // `total` is derived from `hours` — re-run when it changes
  }, [enabled, hours, total, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(DISMISS_KEY, "1");
    }
  };

  if (!enabled || dismissed) return null;

  const pct = total > 0 ? (remaining / total) * 100 : 0;

  return (
    <div className="relative z-30 safe-top">
      <div className="bg-gradient-to-r from-red-900/90 via-red-700/90 to-red-900/90 border-b border-red-400/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Flame
              size={14}
              className="text-amber-300 shrink-0 animate-pulse"
            />
            <span className="text-[10px] sm:text-xs uppercase tracking-wider font-bold text-red-100 truncate">
              🔥 Oferta termina em{" "}
              <span className="font-mono font-bold text-amber-300 ml-1">
                {formatTime(remaining)}
              </span>
            </span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-red-200/70 hover:text-white transition-colors p-1 -m-1"
            aria-label="Dispensar"
          >
            <X size={12} />
          </button>
        </div>
        {/* Progress bar at bottom */}
        <div className="h-0.5 bg-red-950/50">
          <div
            className="h-full bg-gradient-to-r from-amber-300 to-red-400 transition-all duration-1000 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
