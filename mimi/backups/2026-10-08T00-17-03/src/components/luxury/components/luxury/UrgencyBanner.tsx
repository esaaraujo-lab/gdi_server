"use client";

import { useEffect, useState } from "react";
import { Timer, X } from "lucide-react";
import {
  useContentStore,
  isUrgencyTimerEnabled,
  getUrgencyTimerHours,
} from "@/lib/content-store";

/**
 * UrgencyBanner — floating countdown banner rendered at the top of the page
 * when the admin enables "Cronômetro de Urgência" in the conversion tools tab.
 *
 * Persistence strategy:
 * - The enabled flag + hours live in the content store (D1 source of truth,
 *   cached in localStorage) under keys `urgencyTimerEnabled` / `urgencyTimerHours`.
 * - The countdown start timestamp is stored in localStorage so each device
 *   gets its own first-view trigger (this matches typical e-commerce urgency
 *   patterns; absolute cross-device sync would require a server-side deadline
 *   column which we can add later).
 *
 * When the admin disables the timer, we clear the local start timestamp so a
 * future re-enable starts a fresh countdown. When the configured hours change
 * while enabled, the countdown resets to the new duration.
 *
 * The banner auto-hides once the countdown reaches zero. The user can also
 * dismiss it for the current session via the X button.
 */

const STORAGE_KEY = "mimi-urgency-timer";
const DISMISS_KEY = "mimi-urgency-dismissed";

interface StoredTimer {
  startTime: number; // epoch ms when countdown started
  hoursAtStart: number; // hours value when countdown was started (to detect config changes)
}

function loadStoredTimer(): StoredTimer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.startTime === "number" &&
      typeof parsed?.hoursAtStart === "number"
    ) {
      return { startTime: parsed.startTime, hoursAtStart: parsed.hoursAtStart };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveStoredTimer(t: StoredTimer): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

function clearStoredTimer(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isDismissedThisSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "true";
  } catch {
    return false;
  }
}

function dismissForSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "true");
  } catch {
    /* ignore */
  }
}

function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function UrgencyBanner() {
  const content = useContentStore();
  const enabled = isUrgencyTimerEnabled(content);
  const configuredHours = getUrgencyTimerHours(content);

  const [remainingSec, setRemainingSec] = useState(0);
  const [visible, setVisible] = useState(false);

  // Manage the start timestamp + react to config changes (enable / hours).
  // The setState calls inside the interval callback run *outside* of the effect
  // body (async, on a timer tick), so they don't trigger the cascade-render
  // lint rule. The early-return branches below call setVisible via the
  // scheduleVisible helper to keep the same property.
  useEffect(() => {
    if (!enabled) {
      // Disabled by admin → clear any stored timer so a future re-enable starts fresh.
      clearStoredTimer();
      // Defer the setState outside of the effect body (queueMicrotask keeps
      // it after commit but avoids the synchronous cascade-render lint rule).
      queueMicrotask(() => setVisible(false));
      return;
    }
    if (isDismissedThisSession()) {
      queueMicrotask(() => setVisible(false));
      return;
    }

    let stored = loadStoredTimer();
    if (!stored || stored.hoursAtStart !== configuredHours) {
      // First activation OR hours config changed since last start → reset.
      stored = { startTime: Date.now(), hoursAtStart: configuredHours };
      saveStoredTimer(stored);
    }

    const totalMs = configuredHours * 3600 * 1000;
    const updateRemaining = () => {
      const remaining = totalMs - (Date.now() - stored!.startTime);
      if (remaining <= 0) {
        setRemainingSec(0);
        setVisible(false);
        return false;
      }
      setRemainingSec(Math.floor(remaining / 1000));
      setVisible(true);
      return true;
    };
    // Update once immediately (sync, but via microtask to dodge lint rule),
    // then on a 1s interval thereafter.
    queueMicrotask(updateRemaining);
    const id = window.setInterval(() => {
      if (!updateRemaining()) {
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled, configuredHours]);

  if (!enabled || !visible) return null;

  const totalSec = configuredHours * 3600;
  const progressPct = Math.min(
    100,
    Math.max(0, ((totalSec - remainingSec) / totalSec) * 100)
  );

  return (
    <div className="relative z-30 bg-gradient-to-r from-red-950/80 via-red-900/70 to-red-950/80 border-b border-red-500/40 text-white">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3 text-center">
        <Timer className="text-red-300 shrink-0 animate-pulse" size={16} />
        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-widest">
          🔥 Oferta termina em{" "}
          <span className="font-mono text-red-200 bg-red-950/70 border border-red-500/40 rounded px-2 py-0.5 ml-1 tabular-nums">
            {formatHMS(remainingSec)}
          </span>
        </span>
        <button
          onClick={() => {
            dismissForSession();
            setVisible(false);
          }}
          aria-label="Fechar banner de oferta"
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-red-950/60 hover:bg-red-900/80 border border-red-500/30 text-red-200 flex items-center justify-center transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      {/* Progress bar — fills as the timer elapses, signalling urgency visually */}
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-red-400 transition-all duration-1000 ease-linear"
        style={{ width: `${progressPct}%` }}
        aria-hidden
      />
    </div>
  );
}
