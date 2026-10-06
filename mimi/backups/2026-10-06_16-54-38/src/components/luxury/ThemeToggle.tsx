"use client";

import { useEffect, useState, useCallback } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type Theme = "auto" | "light" | "dark";

function applyThemeClass(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("force-dark", "force-light");
  if (t === "dark") root.classList.add("force-dark");
  else if (t === "light") root.classList.add("force-light");
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "auto";
  return (localStorage.getItem("mimi-theme") as Theme) || "auto";
}

/**
 * Botão de alternar tema (dark/light/auto).
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  // Marca como montado via lazy init para evitar setState em effect
  const [mounted] = useState(() => {
    if (typeof window !== "undefined") {
      const t = (localStorage.getItem("mimi-theme") as Theme) || "auto";
      applyThemeClass(t);
    }
    return true;
  });

  const cycle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme =
        prev === "auto" ? "dark" : prev === "dark" ? "light" : "auto";
      localStorage.setItem("mimi-theme", next);
      applyThemeClass(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  if (!mounted) {
    return (
      <button
        className="w-9 h-9 rounded-full border border-gold-500/20 flex items-center justify-center text-gray-400"
        aria-label="Carregando tema"
      >
        <Monitor size={14} />
      </button>
    );
  }

  return (
    <button
      onClick={cycle}
      title={
        theme === "auto"
          ? "Tema: Automático (segue o aparelho)"
          : theme === "dark"
          ? "Tema: Escuro"
          : "Tema: Claro"
      }
      aria-label={`Alternar tema (atual: ${theme})`}
      className="w-9 h-9 rounded-full border border-gold-500/20 flex items-center justify-center text-gray-400 hover:text-gold-400 hover:border-gold-400/50 transition-all shrink-0"
    >
      {theme === "auto" ? <Monitor size={14} /> : theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  );
}
