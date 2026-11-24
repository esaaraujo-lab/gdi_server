// ═══════════════════════════════════════════════════════════════
// Meggy Desktop — App Principal (React)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Login from "./pages/Login";
import Home from "./pages/Home";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const session = await invoke<{ logged_in: boolean }>("check_session");
      setLoggedIn(session.logged_in);
    } catch (_) {
      setLoggedIn(false);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        {/* ★ v1.9.11: cara verdadeira da Meggy (meggy-fab-dark.webp — o app é tema escuro), no lugar do 🐩. */}
        <img src="/meggy-fab-dark.webp" alt="Meggy" style={{ width: "48px", height: "48px", borderRadius: "50%" }} />
      </div>
    );
  }

  if (!loggedIn) {
    return <Login onLogin={() => setLoggedIn(true)} />;
  }

  return <Home onLogout={() => setLoggedIn(false)} />;
}
